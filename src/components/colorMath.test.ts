import { describe, expect, it } from 'vitest'
import { parseHexColor, rgbToHex } from './colorMath'

describe('parseHexColor', () => {
  it('reads #rrggbb into sRGB bytes', () => {
    expect(parseHexColor('#e3b96f')).toEqual([0xe3, 0xb9, 0x6f])
    expect(parseHexColor('#000000')).toEqual([0, 0, 0])
    expect(parseHexColor('#ffffff')).toEqual([255, 255, 255])
  })

  it('accepts a hex string without the leading hash', () => {
    expect(parseHexColor('71a66e')).toEqual([0x71, 0xa6, 0x6e])
  })
})

describe('rgbToHex', () => {
  it('round-trips palette colours', () => {
    for (const hex of ['#20251f', '#1ed4ae', '#eec94d', '#0b0f11']) {
      expect(rgbToHex(parseHexColor(hex))).toBe(hex)
    }
  })

  it('clamps and rounds out-of-range channels', () => {
    expect(rgbToHex([-20, 300, 127.6])).toBe('#00ff80')
  })
})
