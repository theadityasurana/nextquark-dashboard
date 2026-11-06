import { describe, expect, it } from "vitest"
import { DEFAULT_COUNTRY, resolvePhoneCountry, nationalNumber, usablePhone } from "./phone-country"

describe("resolvePhoneCountry", () => {
  it("prefers an explicit stored dial code", () => {
    expect(resolvePhoneCountry({ countryCode: "+44" }).iso).toBe("gb")
    expect(resolvePhoneCountry({ country_code: "44" }).iso).toBe("gb")
  })

  it("accepts an ISO code stored in the country_code field", () => {
    expect(resolvePhoneCountry({ countryCode: "DE" }).iso).toBe("de")
  })

  it("reads a dial prefix off the phone number", () => {
    expect(resolvePhoneCountry({ phone: "+61 400 123 456" }).iso).toBe("au")
    expect(resolvePhoneCountry({ phone: "+919876543210" }).iso).toBe("in")
  })

  it("matches the longest dial prefix, not the first", () => {
    // +353 must not resolve as +3-something; +91 must not lose to a shorter code.
    expect(resolvePhoneCountry({ phone: "+353871234567" }).iso).toBe("ie")
    expect(resolvePhoneCountry({ phone: "+971501234567" }).iso).toBe("ae")
  })

  it("falls back to the location when there's no dial code", () => {
    expect(resolvePhoneCountry({ location: "Gurgaon, India" }).iso).toBe("in")
    expect(resolvePhoneCountry({ location: "Seattle, WA" }).iso).toBe("us")
    expect(resolvePhoneCountry({ location: "London" }).iso).toBe("gb")
    expect(resolvePhoneCountry({ location: "Toronto, Canada" }).iso).toBe("ca")
  })

  it("recognizes Indian cities without the country named", () => {
    for (const city of ["Bengaluru", "Noida", "Hyderabad", "Gurugram"]) {
      expect(resolvePhoneCountry({ location: city }).iso).toBe("in")
    }
  })

  it("uses location to disambiguate the shared +1 code", () => {
    // +1 is US and Canada. Location decides; without one, US wins by volume.
    expect(resolvePhoneCountry({ phone: "+14165551234", location: "Toronto, Canada" }).iso).toBe("ca")
    expect(resolvePhoneCountry({ phone: "+12125551234", location: "New York, NY" }).iso).toBe("us")
    expect(resolvePhoneCountry({ phone: "+12125551234" }).iso).toBe("us")
  })

  it("prefers the explicit code over the location when they disagree", () => {
    expect(resolvePhoneCountry({ countryCode: "+44", location: "Mumbai, India" }).iso).toBe("gb")
  })

  it("falls back to the default when nothing is known", () => {
    expect(resolvePhoneCountry({})).toEqual(DEFAULT_COUNTRY)
    expect(resolvePhoneCountry({ location: "Atlantis" })).toEqual(DEFAULT_COUNTRY)
    expect(resolvePhoneCountry({ phone: "9876543210" })).toEqual(DEFAULT_COUNTRY)
  })

  it("ignores an unrecognized dial code rather than guessing a near match", () => {
    // A wrong guess writes a wrong phone number onto a real application.
    expect(resolvePhoneCountry({ countryCode: "+999" })).toEqual(DEFAULT_COUNTRY)
  })

  it("always returns a dial code starting with +", () => {
    for (const input of [{ countryCode: "91" }, { phone: "+4407700900000" }, {}]) {
      expect(resolvePhoneCountry(input).dial.startsWith("+")).toBe(true)
    }
  })
})

describe("nationalNumber", () => {
  it("keeps a 10-digit Indian mobile that begins with 91", () => {
    expect(nationalNumber("9131852613", "+91")).toBe("9131852613")
    expect(nationalNumber("91318 52613", "+91")).toBe("9131852613")
  })
  it("strips the dial code when it is really there", () => {
    expect(nationalNumber("+91 98765 43210", "+91")).toBe("9876543210")
    expect(nationalNumber("919876543210", "+91")).toBe("9876543210")
    expect(nationalNumber("15551234567", "+1")).toBe("5551234567")
  })
  it("keeps a US number whose area code starts with its dial digit", () => {
    expect(nationalNumber("1175551234", "+1")).toBe("1175551234")
  })
  it("handles a number with no dial code", () => {
    expect(nationalNumber("8765432109", "+91")).toBe("8765432109")
    expect(nationalNumber("", "+91")).toBe("")
  })
})

describe("usablePhone", () => {
  it("keeps a real number exactly as written", () => {
    expect(usablePhone("9131852613", "+91")).toBe("9131852613")
    expect(usablePhone("+91 98765 43210", "+91")).toBe("+91 98765 43210")
  })
  it("makes one up when the number is missing or invalid", () => {
    expect(usablePhone("123456789", "+91")).toBe("9000000001")
    expect(usablePhone("307407662", "+91")).toBe("9000000001")
    expect(usablePhone("", "+91")).toBe("9000000001")
    expect(usablePhone(null, "+1")).toBe("2025550123")
    expect(usablePhone("0000000000", "+91")).toBe("9000000001")
  })
})
