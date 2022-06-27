import BI from "jsbi"


export const ZERO = BI.BigInt("0")
export const ONE = BI.BigInt("1")
export const TWO = BI.BigInt("2")

export function abs(x: BI): BI {
    return BI.GE(x, ZERO) ? x : BI.unaryMinus(x)
}

export interface Egcd {
    g: BI
    x: BI
    y: BI
}

/**
 * An iterative implementation of the extended euclidean algorithm or extended greatest common divisor algorithm.
 * Take positive integers a, b as input, and return a triple (g, x, y), such that ax + by = g = gcd(a, b).
 *
 * @param a
 * @param b
 *
 * @throws {RangeError}
 * This exception is thrown if a or b are less than 0
 *
 * @returns A triple (g, x, y), such that ax + by = g = gcd(a, b).
 */
export function eGcd (a: BI, b: BI): Egcd {
    if (BI.LE(a, ZERO) || BI.LE(b, ZERO)) throw new RangeError("a and b MUST be > 0") // a and b MUST be positive

    let x = ZERO
    let y = ONE
    let u = ONE
    let v = ZERO

    while (BI.NE(a, ZERO)) {
        const q = BI.divide(b, a)
        const r: BI = BI.remainder(b, a)
        const m = BI.subtract(x, BI.multiply(u, q))
        const n = BI.subtract(y, BI.multiply(v, q))
        b = a
        a = r
        x = u
        y = v
        u = m
        v = n
    }
    return { g: b, x, y }
}

/**
 * Modular inverse.
 *
 * @param a The number to find an inverse for
 * @param n The modulo
 *
 * @throws {RangeError}
 * Excpeption thorwn when a does not have inverse modulo n
 *
 * @returns The inverse modulo n
 */
export function modInv (a: BI, n: BI): BI {
    const egcd = eGcd(toZn(a, n), n)
    if (BI.NE(egcd.g, ONE)) {
        throw new RangeError(`${a.toString()} does not have inverse modulo ${n.toString()}`)
    } else {
        return toZn(egcd.x, n)
    }
}

/**
 * Finds the smallest positive element y that is congruent to x in modulo N,
 * i.e. y - x = 0 (mod N)
 *
 * @param x - An integer
 * @param N - The modulus
 *
 * @throws {RangeError}
 * Exception thrown when n is not positive
 *
 * @returns The number with the smallest positive representation of x (mod N)
 */
export function toZn (x: BI, N: BI): BI {
    if (BI.LE(N, ZERO)) throw new RangeError("n must be > 0")

    const aZn = BI.remainder(x, N)
    return BI.LT(aZn, ZERO) ? BI.add(aZn, N) : aZn
}

/**
 * Fast modular exponentiation x**y (mod N)
 *
 * @param x base
 * @param y exponent
 * @param N modulus
 *
 * @throws {RangeError}
 * Exception thrown when N is not at least 1
 *
 * @returns x**y (mod N)
 */
export function modPow(x: BI, y: BI, N: BI): BI {
    if (BI.LE(N, ONE)) throw new RangeError("n must be > 1")

    let base = toZn(x, N)

    if (BI.LE(y, ZERO)) return modInv(modPow(base, abs(y), N), N)

    let result = ONE

    let currExp = y
    while (BI.GT(currExp, ZERO)) {
        if (BI.equal(BI.remainder(currExp, TWO), ONE)) {
            result = BI.remainder(BI.multiply(result, base), N)
        }
        currExp = BI.divide(currExp, TWO)
        base = BI.remainder(BI.exponentiate(base, TWO), N)
    }
    return result
}
