import * as fs from 'fs';
import SpcReader, { ISpc } from 'spc-reader';

import { BootLoader, DspLoader } from './programs';

// The bounds for where the boot loader can be written to
const LOWEST_BOOTABLE_ADDRESS = 0x100;
const HIGHEST_BOOTABLE_ADDRESS = 0xFFBF;

export class SpcWriter {
  private spc: ISpc;
  private bootLoader: Buffer;
  private bootLoaderOffset: number;
  private stackPointer: number;
  private dspLoader: Buffer;

  /**
   * Loads and prepares an SPC for playing
   *
   * @param spcFileName The path to the SPC file to play
   */
  async load(spcFileName: string) {
    this.spc = await SpcReader(spcFileName);

    // Calculate where the stack pointer will be
    this.stackPointer = this.spc.regSP - 6;

    // Write the loader programs
    this.writeBootLoader();
    this.writeDspLoader();
  }

  /**
   * Plays the SPC out to the spcduino
   */
  async play() {
    // Make a copy of the SPC data and DSP registers for augmentation
    const programData = Buffer.from(this.spc.programData.map(byte => byte));
    const dspRegisters = Buffer.from(this.spc.dspRegisters.map(byte => byte));

    // Mute all voices and let the SPC program re-enable as needed
    dspRegisters[0x6C] = 0x60;
    dspRegisters[0x4C] = 0x00;

    // Copy in the boot loader
    this.bootLoader.copy(programData, this.bootLoaderOffset);

    // Initialize the stack (stack space is at 0x100)
    programData[0xFF] = this.stackPointer;
    const stackPointer = 0x100 + this.stackPointer;
    programData[stackPointer + 1] = this.spc.regA;
    programData[stackPointer + 2] = this.spc.regX;
    programData[stackPointer + 3] = this.spc.regY;
    programData[stackPointer + 4] = this.spc.regPSW;
    programData[stackPointer + 5] = this.spc.regPC & 0xFF;
    programData[stackPointer + 6] = this.spc.regPC >> 8;
  }

  /**
   * Writes the boot loader and finds a space in the SPC data to place it
   */
  private writeBootLoader() {
    // First, find a blank space to write the boot loader to
    this.bootLoaderOffset = this.findBootLoaderAddress();
    if (this.bootLoaderOffset === -1) {
      throw new Error('Unable to find space to place boot loader');
    }

    const { programData } = this.spc;

    // If there's no data on the external ports (0xF4 - 0xF7), make not as it
    // changes a value we write to the boot loader
    const hasInPortValues = !programData[0xF4] && !programData[0xF5] && !programData[0xF6] && !programData[0xF7];

    // Copy over the boot loader program and replace certain values with data
    // from the SPC program
    this.bootLoader = Buffer.alloc(BootLoader.length);
    BootLoader.copy(this.bootLoader);
    this.bootLoader[0x01] = programData[0x00];
    this.bootLoader[0x04] = programData[0x01];
    this.bootLoader[0x10] = hasInPortValues ? programData[0xF4] : 0x01;
    this.bootLoader[0x16] = programData[0xF7];
    this.bootLoader[0x1A] = programData[0xF1] & 0xCF;
    this.bootLoader[0x20] = this.spc.dspRegisters[0x6C];
    this.bootLoader[0x26] = this.spc.dspRegisters[0x47];
    this.bootLoader[0x29] = programData[0xF2];
  }

  /**
   * Writes the DSP register loader
   */
  private writeDspLoader() {
    this.dspLoader = Buffer.alloc(DspLoader.length);
    DspLoader.copy(this.dspLoader);
    this.dspLoader[0x0F] = this.spc.programData[0xFC];
    this.dspLoader[0x12] = this.spc.programData[0xFB];
    this.dspLoader[0x15] = this.spc.programData[0xFA];
    this.dspLoader[0x18] = this.stackPointer;
  }

  /**
   * Attempts to find a contiguous space of samey data in the SPC program to
   * put the boot loader.
   *
   * @returns The address to place the boot loader or -1 if no space was found
   */
  private findBootLoaderAddress(): number {
    let retVal = -1;
    const bootLoaderSize = BootLoader.length;

    // Calculate where the echo data is. We don't want to overwrite that
    const dspEchoAddress = this.spc.dspRegisters[0x6D] * 0x100;
    const dspEchoSize = this.spc.dspRegisters[0x7D] * 0x800;

    // Start at the back of the SPC and work backwards
    for (let i = HIGHEST_BOOTABLE_ADDRESS; i > LOWEST_BOOTABLE_ADDRESS + bootLoaderSize; i--) {
      // If this is inside echo space, move along
      if (i >= dspEchoAddress && i <= dspEchoAddress + dspEchoSize) {
        continue;
      }

      // If this byte and the byte at the start of the chunk are the same, check for empty space in between
      if (this.spc.programData[i] === this.spc.programData[i - bootLoaderSize]) {
        let j;
        for (j = i - bootLoaderSize; j < i; j++) {
          if (this.spc.programData[i] !== this.spc.programData[j]) {
            break;
          }
        }

        // If the end of the loop was reached, we've got empty space
        if (j === i) {
          retVal = i - bootLoaderSize;
          console.info(`Found space for boot loader at 0x${retVal.toString(16)}`);
          break;
        }
      }
    }

    return retVal;
  }
}
