import * as SerialPort from 'serialport';
const Readline: any = require('@serialport/parser-readline');

// Command codes as defined by spcduino
const CMD_RESET = 1; // Resets the SPC700
const CMD_LOAD_DSP = 2; // Sends the DSP loader program and register data
const CMD_START_SPC = 3; // Begins SPC memory transfer
const CMD_SPC_CHUNK = 4; // Transfers another chunk of SPC data
const CMD_PLAY = 5; // Sends the parameters for playing the SPC

// The response codes that can be received from the spcduino
const RSP_OKAY = 1;
const RSP_FAIL = 2;
const RSP_BAD_CHECKSUM = 3;
const RSP_READY = 86;

// Maximum number of bytes to send in any serial transaction
const MAX_SEND_SIZE = 64;
const ZERO_PAGE_SIZE = 0xEF - 2;

export class Spcduino {
  private port: SerialPort;
  private lineParser: any;

  constructor(portName: string, baudRate: number) {
    this.port = new SerialPort(portName, { baudRate, autoOpen: false });
  }

  /**
   * Opens serial communication to the spcduino
   */
  async open() {
    return new Promise((resolve, reject) => {
      // On a new serial connection, the spcduino will reboot.
      // Once it's established the connection, it'll send the READY
      // signal, so wait for that before resolving
      const handleDataEvent = (data: Buffer) => {
        if (data[0] === RSP_READY) {
          this.lineParser = this.port.pipe(new Readline());
          this.lineParser.on('data', this.handleDataEvent.bind(this));
          this.port.off('open', handleDataEvent);
          resolve();
        }
      }

      this.port.on('data', handleDataEvent);
      this.port.open(err => err ? reject(err) : null);
    });
  }

  handleDataEvent(data: string) {
    console.log(`[SPCDUINO] ${data}`);
  }

  /**
   * Resets the spcduino
   */
  async reset() {
    try {
      await this.writeAndWait([ CMD_RESET ]);
    } catch (exc) {
      throw new Error('Error resetting SPC');
    }
  }

  /**
   * Initializes the DSP registers
   */
  async initDsp(dspLoader: Buffer, dspRegisters: Buffer) {
    try {
      // First send the DSP loader
      let buffer = this.prepareBufferForSending(dspLoader);
      await this.writeAndWait([ CMD_LOAD_DSP, ...buffer ]);

      // And then the DSP registers. spcduindo will respond once the
      // DSP loader program has run
      buffer = this.prepareBufferForSending(dspRegisters);
      await this.writeAndWait(buffer);
    } catch (exc) {
      const errorMsg = exc === RSP_BAD_CHECKSUM ? 'Failed checksum' : 'Unknown error';
      throw new Error(`Error initializing DSP: ${errorMsg}`);
    }
  }

  /**
   * Sends the SPC memory to the spcduino
   *
   * @param buffer The SPC program
   */
  async loadSPC(spcProgram: Buffer) {
    try {
      // Load zero page data
      let buffer = Buffer.alloc(ZERO_PAGE_SIZE);
      spcProgram.copy(buffer, 0, 2, 0xEF);
      buffer = this.prepareBufferForSending(buffer);
      await this.writeAndWait([ CMD_START_SPC, ...buffer ]);
      console.log('zero page data written');
    } catch (exc) {
      const errorMsg = exc === RSP_BAD_CHECKSUM ? 'Failed checksum' : 'Unknown error';
      throw new Error(`Error initializing DSP: ${errorMsg}`);
    }
  }

  /**
   * Writes data to the spcduino and waits for a success/fail response. If
   * there is any failure, the promise will be rejected.
   *
   * @param buffer The data buffer to send to the spcduino
   */
  private async writeAndWait(buffer: number[] | Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.port.isOpen) {
        reject('Port has not been opened');
      }

      const handleDataEvent = (data: Buffer) => {
        this.port.off('data', handleDataEvent);
        this.port.off('eror', reject);
        console.log('got data?', data);
        if (data[0] !== RSP_OKAY) {
          reject(data);
        } else {
          resolve(data);
        }
      };

      this.port.on('error', reject);
      this.port.on('data', handleDataEvent);
      buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      this.writeBuffer(buffer, 0).catch(err => {
        this.port.off('data', handleDataEvent);
        this.port.off('eror', reject);
        reject(err);
      });
    });
  }

  private async writeBuffer(buffer: Buffer, offset: number, bytesWritten: number = 0) {
    return new Promise((resolve, reject) => {
      // Calculate how much data to send without going over the chunk size limit
      const chunkSize = buffer.byteLength - offset > MAX_SEND_SIZE ? MAX_SEND_SIZE : buffer.byteLength - offset;

      // Using the above, create a new buffer with only the data we need to send
      const sendBuffer = Buffer.alloc(chunkSize);
      buffer.copy(sendBuffer, 0, offset, offset + chunkSize);
      offset += chunkSize;

      this.port.write(sendBuffer);
      this.port.drain(err => {
        if (err) {
          reject(err);
        }
        // Continue sending bytes until there's nothing left to send
        else if (offset < buffer.byteLength) {
          resolve(this.writeBuffer(buffer, offset, bytesWritten + chunkSize));
        } else {
          resolve();
          console.log('Wrote ', bytesWritten + chunkSize, ' bytes');
        }
      });
    });
  }

  /**
   * Calculates a checksum from a buffer. Used to verify data chunks sent to the spcduino
   *
   * @param {Buffer} buffer The buffer to calculate the checksum from
   * @return {number} The calculated checksum
   */
  private calculateChecksum(buffer: Buffer): number {
    return buffer.reduce((previousValue: number, currentValue: number) => {
      return (previousValue + currentValue) & 0xFF;
    }, 0);
  }

  /**
   * Prepares a buffer for sending by appending the checksum
   *
   * @param {Buffer} buffer The buffer to be sent
   * @return {Buffer} The buffer with checksum appended to be sent to the spcduino
   */
  private prepareBufferForSending(buffer: Buffer): Buffer {
    return Buffer.from([ ...buffer, this.calculateChecksum(buffer) ]);
  }

}
