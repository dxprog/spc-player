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
  async read(spcFileName: string) {
    this.spc = await SpcReader(spcFileName);

    // Calculate where the stack pointer will be
    this.stackPointer = this.spc.regSP - 6;

    // Write the loader programs
    this.writeBootLoader();
    this.writeDspLoader();
  }

  /**
   * Writes the SPC out to the spcduino
   */
  async write() {
    // Make a copy of the SPC data for augmentation
    const programData = Buffer.from(this.spc.programData.map(byte => byte));

    // Copy in the boot loader
    this.bootLoader.copy(programData, this.bootLoaderOffset);

    // Initialize the stack
    programData[0xFF] = this.stackPointer;
    programData[this.stackPointer + 1] = this.spc.regA;
    programData[this.stackPointer + 2] = this.spc.regX;
    programData[this.stackPointer + 3] = this.spc.regY;
    programData[this.stackPointer + 4] = this.spc.regPSW;
    programData[this.stackPointer + 5] = this.spc.regPC & 0xFF;
    programData[this.stackPointer + 6] = this.spc.regPC >> 8;
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

    // Copy over the boot loader program and replace certain values with data
    // from the SPC program
    BootLoader.copy(this.bootLoader);
    this.bootLoader[0x01] = this.spc.programData[0x00];
    this.bootLoader[0x04] = this.spc.programData[0x01];
    this.bootLoader[0x10] = this.spc.programData[0xF4];
    this.bootLoader[0x16] = this.spc.programData[0xF7];
    this.bootLoader[0x1A] = this.spc.programData[0xF1] & 0xCF;
    this.bootLoader[0x20] = this.spc.dspRegisters[0x6C];
    this.bootLoader[0x26] = this.spc.dspRegisters[0x47];
    this.bootLoader[0x29] = this.spc.programData[0xF2];
  }

  /**
   * Writes the DSP register loader
   */
  private writeDspLoader() {
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

    // Start at the back of the SPC and work backwards
    for (let i = HIGHEST_BOOTABLE_ADDRESS; i > LOWEST_BOOTABLE_ADDRESS + bootLoaderSize; i--) {
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
          break;
        }
      }
    }

    return retVal;
  }
}
