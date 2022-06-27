import { BASE64, HEX_DIGITS } from "./Constants";
import BI from "jsbi"


/**
 * Converts a hex string not prefixed by "0x" to Base64
 */
export function base64OfHex(inp: string): string {
    const matchArray = inp.match(/../g)
    if (matchArray == null) return ""
    const byteArray: Uint8Array = new Uint8Array(matchArray.map(h => parseInt(h, 16)))
    return base64OfArray(byteArray)
}
/**
 * Converts a hex string not prefixed by "0x" to Base64
 */
export function base64OfBigInt(inp: BI): string {
    return base64OfHex(nonprefixedHexOfPositiveBI(inp))
}

/**
 * Non-prefixed hex string with an even length
 */
export function hexOfBase64(inp: string): string {
    return trimHexZeroes(hexOfArray(arrayOfBase64(inp)))
}

/**
 * Trims leading zeroes from a non-prefixed hex string to guarantee the following:
 * 1) even number of digits 2) no more than one zero in prefix
 */
function trimHexZeroes(inp: string): string {
    let countZeroes = 0
    for (; countZeroes < inp.length && inp[countZeroes] === "0"; ++countZeroes) {}
    if (countZeroes > 0) {
        return (inp.length - countZeroes) % 2 === 0
                ? inp.substring(countZeroes)
                : inp.substring(countZeroes - 1)
    } else {
        return inp.length % 2 === 0
                ? inp
                : ("0" + inp)
    }
}

/**
 * Decodes a Base64 string directly into a BigInt
 */
export function bigintOfBase64(inp: string): BI {
    const byteArr = arrayOfBase64(inp);
    const prefixedHex: string = "0x" + (Array.from(byteArr)
                                .map((b) => HEX_DIGITS[b >> 4] + HEX_DIGITS[b & 15])
                                .join(""));
    return BI.BigInt(prefixedHex);
}

/**
 * Takes a non-prefixed, even-length hex string
 */
export function bigintOfHex(inp: string): BI {
    if (inp.startsWith("0")) return BI.BigInt("0x" + inp.substring(1))
    return BI.BigInt("0x" + inp)
}

/**
 * Outputs a string with a "0x" prefix and an even number of bytes
 * Userful for creating BigInts from byte arrays.
 */
export function prefixedHexOfArray(inp: Uint8Array): string {
    return "0x" + (Array.from(inp)
                .map((b) => HEX_DIGITS[b >> 4] + HEX_DIGITS[b & 15])
                .join(""));
}

/**
 * Encodes a byte array into a Base-64 string
 */
export function base64OfArray(inp: Uint8Array): string {
    const numWhole = Math.floor(inp.length/3)
    const extraBytes = inp.length - (numWhole*3)
    let result = ""
    let i = 0;
    for (; i < numWhole; ++i) {
        result += BASE64[inp[i*3] >> 2]
        result += BASE64[((inp[i*3] & 3) << 4) + (inp[i*3 + 1] >> 4)]
        result += BASE64[((inp[i*3 + 1] & 15) << 2) + (inp[i*3 + 2] >> 6)]
        result += BASE64[inp[i*3 + 2] & 63]
    }
    if (extraBytes == 1) {
        result += BASE64[inp[i*3] >> 2]
        result += BASE64[(inp[i*3] & 3) << 4]
    } else if (extraBytes == 2) {
        result += BASE64[inp[i*3] >> 2]
        result += BASE64[((inp[i*3] & 3) << 4) + (inp[i*3 + 1] >> 4)]
        result += BASE64[(inp[i*3 + 1] & 15) << 2]
    }
    if (extraBytes > 0) {
        for (let j = 3 - extraBytes; j > 0; --j) {
            result += "="
        }
    }
    return result
}

/**
 * Decodes a Base64 string into a byte array.
 */
export function arrayOfBase64(inp: string): Uint8Array {
    const paddingChars = determinePadding(inp)
    const resultLength = paddingChars == 0
                            ? inp.length/4*3
                            : (paddingChars == 1
                                ? (inp.length/4*3 - 1)
                                : (inp.length/4*3 - 2))
    const result = new Uint8Array(resultLength)
    let fullQuads = paddingChars === 0 ? inp.length/4 : inp.length/4 - 1
    let i = 0
    for (; i < fullQuads; ++i) {
        const int1 = num64OfBase64(inp.charCodeAt(i*4    ))
        const int2 = num64OfBase64(inp.charCodeAt(i*4 + 1))
        const int3 = num64OfBase64(inp.charCodeAt(i*4 + 2))
        const int4 = num64OfBase64(inp.charCodeAt(i*4 + 3))
        result[i*3    ] = (int1 << 2) + (int2 >> 4)
        result[i*3 + 1] = ((int2 & 15) << 4) + (int3 >> 2)
        result[i*3 + 2] = ((int3 & 3) << 6) + int4
    }

    if (paddingChars === 1) {
        const int1 = num64OfBase64(inp.charCodeAt(i*4    ))
        const int2 = num64OfBase64(inp.charCodeAt(i*4 + 1))
        result[i*3    ] = (int1 << 2) + (int2 >> 4)

        const int3 = num64OfBase64(inp.charCodeAt(i*4 + 2))
        result[i*3 + 1] = ((int2 & 15) << 4) + (int3 >> 2)

    } else if (paddingChars === 2) {
        const int1 = num64OfBase64(inp.charCodeAt(i*4    ))
        const int2 = num64OfBase64(inp.charCodeAt(i*4 + 1))
        result[i*3    ] = (int1 << 2) + (int2 >> 4)
    }
    return result
}

/**
 * The number from 0 to 63 that is a decoding of a Base64 char
 */
function num64OfBase64(charCode: number): number {
    if (charCode === 43) {        // +
        return 62
    } else if (charCode === 47) { // /
        return 63
    } else if (charCode <= 57) {  // digits
        return (charCode + 4)     // - 48 + 52
    } else if (charCode <= 90) {  // capital letters
        return (charCode - 65)
    } else {                      // small letters
        return (charCode - 71)    // - 97 + 26
    }
}

function determinePadding(inp: string): number {
    let result = 0
    for (let i = inp.length - 1; i > -1 && inp[i] === '='; --i) { ++result }
    return result
}

/**
 * Converts BigInt to a hex string with the "0x" prefix.
 * Correctly prepends zero to get an even number of chars.
 * Because of JokeScript's deficiencies, negative BigInts are not handled correctly.
 */
export function prefixedHexOfPositiveBI(inp: BI): string {
    let str = inp.toString(16)
    return (str.length % 2 === 0)
                ? ("0x" + str)
                : (str.startsWith("0")
                    ? ("0x" + str.substring(1))
                    : ("0x0" + str))
}

/**
 * Returns a hex string prefixed by "0x" and with an even number of symbols
 *
 */
export function prefixedHexOfBuff(inp: ArrayBuffer): string {
    return "0x" + (Array.from(new Uint8Array(inp)))
                .map((b) => HEX_DIGITS[b >> 4] + HEX_DIGITS[b & 15])
                .join("");
}

export function hexOfBuff(inp: ArrayBuffer): string {
    return hexOfArray(new Uint8Array(inp))
}

/**
 * Convert BigInt to a hex string without the "0x" prefix.
 * Correctly prepends zero to get an even number of chars.
 * Because of JokeScript's deficiencies, negative BigInts are not handled correctly.
 */
export function nonprefixedHexOfPositiveBI(inp: BI): string {
    let str = inp.toString(16)
    return (str.length % 2 === 0) ? str : (str.startsWith("0") ? str.substring(1) : ("0" + str))
}

/**
 * "a" -> "0a"
 * "ab" -> "ab"
 */
function padZeroPrefix(inp: string): string {
    return inp.length === 1 ? "0" + inp : inp
}

/**
 * Returns a hex string unprefixed by "0x" but with an even number of symbols.
 */
export function hexOfArray(inp: Uint8Array): string {
    let result = ""
    for (let i = 0; i < inp.length; ++i) {
        result = result + padZeroPrefix(inp[i].toString(16))
    }
    return result
}
