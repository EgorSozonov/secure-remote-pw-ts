
import BI from "jsbi"
import { SHA256 } from "crypto-js"
import { base64OfHex, bigintOfBase64, hexOfArray as nonprefixedHexOfArray, hexOfBase64, hexOfBuff, nonprefixedHexOfPositiveBI, prefixedHexOfArray, prefixedHexOfBuff } from "./StringUtils"
import { modPow, ZERO } from "./ModularArithmetic"


/**
 * Implementation of client-side SRP because thinbus-srp is unuseable/not Typescript.
 * Eventually I'll factor this out into a separate library.
 */
class SecureRemotePassword {


/** Verifier */
public verifier = ZERO

/** User identity (login or email etc) */
public I = ""

/** Validation session key to compute K: S = ((A*(v^u % N)) ^ b) % N */
private S: BI = ZERO

/** Server public key */
public B: BI = ZERO

/** Password */
public P = ""

private K = ""

private AHex = ""

private M1Hex = ""

/** Salt computed here on the client */
public salt = ""

public readonly k: BI

public readonly g: BI

public readonly N: BI


constructor(NStr: string, gStr: string, kHexStr: string) {
    this.N = BI.BigInt(NStr)
    this.g = BI.BigInt(gStr)
    this.k = BI.BigInt(kHexStr)
}

/**
 * Returns a randomly-generated salt in non-prefixed hex format.
 * The length of the salt is the same as the hashing algo H.
 */
public async generateRandomSalt(optionalServerSalt?: string): Promise<string> {
    const serverSalt = optionalServerSalt ?? "serverSalt"
    const s = this.randomHex(32);
    const inp = (new Date()) + ":" + serverSalt + ":" + s
    const resultBuffer: ArrayBuffer = await this.hash(inp)
    return nonprefixedHexOfArray(new Uint8Array(resultBuffer))
}

/**
 * Returns a randomly-generated verifier for a new password.
 */
public async generateVerifier(saltHex: string, identity: string, password: string): Promise<BI> {
    const x = await this.generateX(saltHex, identity, password)
    this.verifier = modPow(this.g, x, this.N)
    return this.verifier
}

/**
 * Generate data for sign-in using the handshake response
 */
public async step1(identity: string, password: string, saltB64: string, serverBB64: string): Promise<ValResult<DataForSignIn>> {
    this.I = identity
    this.P = password

    const a = await this.randomA()

    const ANum = modPow(this.g, a, this.N)

    // B64 -> Hex -> BI
    this.B = bigintOfBase64(serverBB64)

    if (BI.equal(BI.remainder(this.B, this.N), ZERO)) {
        return {isOk: false, errMsg: "Bad server public value B = 0"}
    }
    const x = await this.generateX(hexOfBase64(saltB64), this.I, this.P)

    this.AHex = nonprefixedHexOfPositiveBI(ANum)
    const u = await this.computeU(this.AHex, hexOfBase64(serverBB64))

    if (!u) return {isOk: false, errMsg: "Bad client value u"}

    this.verifier = modPow(this.g, x, this.N)

    this.S = this.computeSessionKey(x, u, a)

    const sStr = nonprefixedHexOfPositiveBI(this.S)
    this.K = hexOfBuff(await this.hash(sStr))

    const M1Buff = await this.hash(this.AHex + nonprefixedHexOfPositiveBI(this.B) + sStr)
    this.M1Hex = hexOfBuff(M1Buff)

    const AB64 = base64OfHex(this.AHex)
    const M1B64 = base64OfHex(this.M1Hex)
    return {isOk: true, value: {AB64, M1B64, }}
}

/**
 * Second step of the login process
 * 1. client-side validation of M2 received from server
 * 2. returns the session key
 */
public async step2(serverM2B64: string): Promise<ValResult<BI>> {
    const SHex = nonprefixedHexOfPositiveBI(this.S)
    const M2Buff = await this.hash(this.AHex + this.M1Hex + SHex)
    const clientM2Hex = hexOfBuff(M2Buff)
    const serverM2Hex = hexOfBase64(serverM2B64)
    if (clientM2Hex !== serverM2Hex) return {isOk: false, errMsg: "Bad server credentials (M2)"}

    return {isOk: true, value: this.S}
}


/**
 * Generation of the client private key, "a"
 */
private async randomA(): Promise<BI> {
    let r = ZERO
    while (BI.equal(r, ZERO)) {
        const rstr = this.randomHex(512)
        const rBi = BI.BigInt(rstr)
        const oneTimeBi = BI.BigInt(prefixedHexOfBuff(await this.hash(this.I + ":" + this.salt + ":" + (new Date()).getTime())))
        r = BI.remainder(BI.add(oneTimeBi, rBi), this.N)
    }
    return r
}

/**
 * Compute the scrambler value "u". If it's zero, process is aborted
 */
private async computeU(AHex: string, BHex: string): Promise<BI | undefined> {
    const output = prefixedHexOfBuff(await this.hash(AHex + BHex))
    const result = BI.BigInt(output)
    if (BI.equal(result, ZERO)) {
        return undefined
    }
    return result
}

/**
 * Random string of hex digits with a set length
 */
private randomHex(l: number): string {
    const arr = new Uint8Array(l)
    const result = crypto.getRandomValues(arr)
    return prefixedHexOfArray(result);
}


private async generateX(saltHex: string, identity: string, pw: string): Promise<BI> {
    const hash1 = hexOfBuff(await this.hash(identity + ":" + pw))

    const concat = (saltHex + hash1).toUpperCase()
    const hashHex = prefixedHexOfBuff(await this.hash(concat))

    return BI.remainder(BI.BigInt(hashHex), this.N)
}

/**
 * Client's session key S = (B - kv)^(a + ux)
 */
public computeSessionKey(x: BI, u: BI, a: BI): BI {
    const exp = BI.add(a, BI.multiply(u, x))
    const kv = BI.multiply(this.k, this.verifier)
    const diff = this.posMod(BI.subtract(this.B, kv), this.N)
    return modPow(diff, exp, this.N)
}

/**
 * Returns the smallest non-negative remainder modulo N
 */
private posMod(inp: BI, N: BI): BI {
    const rem = BI.remainder(inp, N)
    return BI.GE(rem, ZERO) ? rem : BI.add(rem, N)
}

private async hash(x: string): Promise<ArrayBuffer> {
    const encoded = new TextEncoder().encode(x)
    const resultArr = await crypto.subtle.digest("SHA-256", encoded)
    return resultArr;
}

}


type ValResult<T> = {isOk: true, value: T} | {isOk: false, errMsg: string}

type DataForSignIn = {AB64: string, M1B64: string}

export default SecureRemotePassword
