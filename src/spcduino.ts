import * as SerialPort from 'serialport';
const Readline: any = require('@serialport/parser-readline');

// Command codes as defined by spcduino
const CMD_RESET = 1;
const CMD_LOAD_DSP = 2;

// The response codes that can be received from the spcduino
const RSP_OKAY = 1;
const RSP_FAIL = 2;
const RSP_BAD_CHECKSUM = 3;
const RSP_READY = 86;

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
      await this.writeAndWait(buffer);

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
   * Writes data to the spcduino and waits for a success/fail response. If
   * there is any failure, the promise will be rejected.
   *
   * @param buffer The data buffer to send to the spcduino
   */
  private async writeAndWait(buffer: string | number[] | Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.port.isOpen) {
        reject('Port has not been opened');
      }

      const handleDataEvent = (data: Buffer) => {
        this.port.off('data', handleDataEvent);
        this.port.off('eror', reject);
        if (data[0] !== RSP_OKAY) {
          reject(data);
        } else {
          resolve(data);
        }
      };

      this.port.on('error', reject);
      this.port.on('data', handleDataEvent);
      this.port.write(buffer);
      this.port.drain(err => {
        if (err) {
          reject(err);
          this.port.off('data', handleDataEvent);
          this.port.off('eror', reject);
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
