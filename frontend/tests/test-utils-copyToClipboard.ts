import { copyToClipboard } from '../src/utils/copyToClipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    })
  })

  test('creates and removes a textarea', () => {
    copyToClipboard('test')
    expect(document.body.children.length).toBe(0)
  })

  test('sets textarea value to the provided text', () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    const el = document.createElement('textarea')
    createElementSpy.mockReturnValue(el)

    copyToClipboard('hello world')

    expect(el.value).toBe('hello world')
  })

  test('positions textarea off-screen', () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    const el = document.createElement('textarea')
    createElementSpy.mockReturnValue(el)

    copyToClipboard('test')

    expect(el.style.position).toBe('fixed')
    expect(el.style.left).toBe('-9999px')
    expect(el.style.opacity).toBe('0')
  })

  test('calls execCommand with copy', () => {
    copyToClipboard('test')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  test('handles empty string', () => {
    expect(() => copyToClipboard('')).not.toThrow()
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  test('handles multiline text', () => {
    expect(() => copyToClipboard('line1\nline2')).not.toThrow()
  })

  test('handles special characters', () => {
    expect(() => copyToClipboard('<script>alert("xss")</script>')).not.toThrow()
  })
})
