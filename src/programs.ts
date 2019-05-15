/**
 * Both of these programs were taken from SNES_APU_SD by emukidid:
 * https://github.com/emukidid/SNES_APU_SD/blob/master/SNES_APU_SD/SNES_APU_SD.ino
 */

/**
 * Program for restoring DSP registers.
 */
export const DspLoader: Buffer = Buffer.from([
  0xC4, 0xF2,       // start:  MOV [0F2h], A
  0x64, 0xF4,       // loop:   CMP A, [0F4h]
  0xD0, 0xFC,       //         BNE loop
  0xFA, 0xF5, 0xF3, //         MOV [0F3h], [0F5h]
  0xC4, 0xF4,       //         MOV [0F4h], A
  0xBC,             //         INC A
  0x10, 0xF2,       //         BPL start

  0x8F, null, 0xFC, //         MOV [0FCh], #timer_2
  0x8F, null, 0xFB, //         MOV [0FBh], #timer_1
  0x8F, null, 0xFA, //         MOV [0FAh], #timer_0

  0xCD, null,       //         MOV X, #stack_pointer
  0xBD,             //         MOV SP, X

  0x2F, 0xAB,       //         BRA 0FFC9h  ; Right when IPL puts AA-BB on the IO ports and waits for CC.
]);

/**
 * Code that boots the SPC and begins program execution
 */
export const BootLoader: Buffer = Buffer.from([
  0x8F, null, 0x00, //         MOV [0], #byte_0
  0x8F, null, 0x01, //         MOV [1], #byte_1
  0x8F, 0xB0, 0xF1, //         MOV [0F1h], #0B0h   ;Clear the IO ports
  0xCD, 0x53,       //         MOV X, #Ack_byte
  0xD8, 0xF4,       //         MOV [0F4h], X

  0xE4, 0xF4,       // in0:    MOV A, [0F4h]
  0x68, null,       //         CMP A, #IO_Byte_0
  0xD0, 0xFA,       //         BNE in0

  0xE4, 0xF7,       // in3:    MOV A, [0F7h]
  0x68, null,       //         CMP A, #IO_Byte_3
  0xD0, 0xFA,       //         BNE in3

  0x8F, null, 0xF1, //         MOV [0F1h], #ctrl_byte

  0x8F, 0x6C, 0xF2, //         MOV [0F2h], 6Ch
  0x8F, null, 0xF3, //         MOV [0F3h], #echo_control_byte
  0x8F, 0x4C, 0xF2, //         MOV [0F2h], 4Ch
  0x8F, null, 0xF3, //         MOV [0F3h], #key_on_byte
  0x8F, null, 0xF2, //         MOV [0F2h], #dsp_control_register_byte
  0xAE,             //         POP A
  0xCE,             //         POP X
  0xEE,             //         POP Y
  0x7F,             //        RET_I
]);
