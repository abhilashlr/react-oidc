﻿// code base on https://coolaj86.com/articles/sign-jwt-webcrypto-vanilla-js/

// String (UCS-2) to Uint8Array
//
// because... JavaScript, Strings, and Buffers
// @ts-ignore
function strToUint8(str) {
    return new TextEncoder().encode(str);
}

// Binary String to URL-Safe Base64
//
// btoa (Binary-to-Ascii) means "binary string" to base64
// @ts-ignore
function binToUrlBase64(bin) {
    return btoa(bin)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+/g, '');
}

// UTF-8 to Binary String
//
// Because JavaScript has a strange relationship with strings
// https://coolaj86.com/articles/base64-unicode-utf-8-javascript-and-you/
// @ts-ignore
function utf8ToBinaryString(str) {
    const escstr = encodeURIComponent(str);
    // replaces any uri escape sequence, such as %0A,
    // with binary escape, such as 0x0A
    const binstr = escstr.replace(/%([0-9A-F]{2})/g, function (match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    });

    return binstr;
}

// Uint8Array to URL Safe Base64
//
// the shortest distant between two encodings... binary string
// @ts-ignore
function uint8ToUrlBase64(uint8) {
    let bin = '';
    // @ts-ignore
    uint8.forEach(function(code) {
        bin += String.fromCharCode(code);
    });
    return binToUrlBase64(bin);
}

// UCS-2 String to URL-Safe Base64
//
// btoa doesn't work on UTF-8 strings
// @ts-ignore
function strToUrlBase64(str) {
    return binToUrlBase64(utf8ToBinaryString(str));
}

export var JWT = {};
// @ts-ignore
JWT.sign = (jwk, headers, claims, jwtHeaderType= 'dpop+jwt') => {
    // Make a shallow copy of the key
    // (to set ext if it wasn't already set)
    jwk = Object.assign({}, jwk);

    // The headers should probably be empty
    headers.typ = jwtHeaderType;
    headers.alg = 'ES256';
    if (!headers.kid) {
        // alternate: see thumbprint function below
        headers.jwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
    }

    const jws = {
        // @ts-ignore
        // JWT "headers" really means JWS "protected headers"
        protected: strToUrlBase64(JSON.stringify(headers)),
        // @ts-ignore
        // JWT "claims" are really a JSON-defined JWS "payload"
        payload: strToUrlBase64(JSON.stringify(claims))
    };

    // To import as EC (ECDSA, P-256, SHA-256, ES256)
    const keyType = {
        name: 'ECDSA',
        namedCurve: 'P-256',
        hash: {name: 'ES256'}
    };

    // To make re-exportable as JSON (or DER/PEM)
    const exportable = true;

    // Import as a private key that isn't black-listed from signing
    const privileges = ['sign'];

    // Actually do the import, which comes out as an abstract key type
    // @ts-ignore
    return window.crypto.subtle
        // @ts-ignore
        .importKey('jwk', jwk, keyType, exportable, privileges)
        .then(function(privateKey) {
            // Convert UTF-8 to Uint8Array ArrayBuffer
            // @ts-ignore
            const data = strToUint8(jws.protected + '.' + jws.payload);

            // The signature and hash should match the bit-entropy of the key
            // https://tools.ietf.org/html/rfc7518#section-3
            const signatureType = {name: 'ECDSA', hash: {name: 'SHA-256'}};

            return window.crypto.subtle.sign(signatureType, privateKey, data).then(function(signature) {
                // returns an ArrayBuffer containing a JOSE (not X509) signature,
                // which must be converted to Uint8 to be useful
                // @ts-ignore
                jws.signature = uint8ToUrlBase64(new Uint8Array(signature));

                // JWT is just a "compressed", "protected" JWS
                // @ts-ignore
                return jws.protected + '.' + jws.payload + '.' + jws.signature;
            });
        });
};


const EC = {};
// @ts-ignore
EC.generate = function() {
    const keyType = {
        name: 'ECDSA',
        namedCurve: 'P-256'
    };
    const exportable = true;
    const privileges = ['sign', 'verify'];
    // @ts-ignore
    return window.crypto.subtle.generateKey(keyType, exportable, privileges).then(function(key) {
        // returns an abstract and opaque WebCrypto object,
        // which in most cases you'll want to export as JSON to be able to save
        return window.crypto.subtle.exportKey('jwk', key.privateKey);
    });
};

// Create a Public Key from a Private Key
//
// chops off the private parts
// @ts-ignore
EC.neuter = function(jwk) {
    const copy = Object.assign({}, jwk);
    delete copy.d;
    copy.key_ops = ['verify'];
    return copy;
};

export var JWK = {};
// @ts-ignore
JWK.thumbprint = function(jwk) {
    // lexigraphically sorted, no spaces
    const sortedPub = '{"crv":"CRV","kty":"EC","x":"X","y":"Y"}'
        .replace('CRV', jwk.crv)
        .replace('X', jwk.x)
        .replace('Y', jwk.y);

    // The hash should match the size of the key,
    // but we're only dealing with P-256
    return window.crypto.subtle
        .digest({ name: 'SHA-256' }, strToUint8(sortedPub))
        .then(function(hash) {
            return uint8ToUrlBase64(new Uint8Array(hash));
        });
};


const guid = function () {
    // RFC4122: The version 4 UUID is meant for generating UUIDs from truly-random or
    // pseudo-random numbers.
    // The algorithm is as follows:
    //     Set the two most significant bits (bits 6 and 7) of the
    //        clock_seq_hi_and_reserved to zero and one, respectively.
    //     Set the four most significant bits (bits 12 through 15) of the
    //        time_hi_and_version field to the 4-bit version number from
    //        Section 4.1.3. Version4 
    //     Set all the other bits to randomly (or pseudo-randomly) chosen
    //     values.
    // UUID                   = time-low "-" time-mid "-"time-high-and-version "-"clock-seq-reserved and low(2hexOctet)"-" node
    // time-low               = 4hexOctet
    // time-mid               = 2hexOctet
    // time-high-and-version  = 2hexOctet
    // clock-seq-and-reserved = hexOctet: 
    // clock-seq-low          = hexOctet
    // node                   = 6hexOctet
    // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // y could be 1000, 1001, 1010, 1011 since most significant two bits needs to be 10
    // y values are 8, 9, A, B
    const guidHolder = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    const hex = '0123456789abcdef';
    let r = 0;
    let guidResponse = "";
    for (let i = 0; i < 36; i++) {
        if (guidHolder[i] !== '-' && guidHolder[i] !== '4') {
            // each x and y needs to be random
            r = Math.random() * 16 | 0;
        }

        if (guidHolder[i] === 'x') {
            guidResponse += hex[r];
        } else if (guidHolder[i] === 'y') {
            // clock-seq-and-reserved first hex is filtered and remaining hex values are random
            r &= 0x3; // bit and with 0011 to set pos 2 to zero ?0??
            r |= 0x8; // set pos 3 to 1 as 1???
            guidResponse += hex[r];
        } else {
            guidResponse += guidHolder[i];
        }
    }

    return guidResponse;
};


export const generateJwkAsync = () => {
    // @ts-ignore
    return EC.generate().then(function(jwk) {
        // console.info('Private Key:', JSON.stringify(jwk));
        // @ts-ignore
        // console.info('Public Key:', JSON.stringify(EC.neuter(jwk)));
        return jwk;
    });
}

export const generateJwtDemonstratingProofOfPossessionAsync = (jwk, method = 'POST', url: string, extrasClaims={}) => {

    const claims = {
        // https://www.rfc-editor.org/rfc/rfc9449.html#name-concept
        jit: btoa(guid()),
        htm: method,
        htu: url,
        iat: Math.round(Date.now() / 1000),
        ...extrasClaims,
    };
    // @ts-ignore
    return JWK.thumbprint(jwk).then(function(kid) {
        // @ts-ignore
        return JWT.sign(jwk, { /*kid: kid*/ }, claims).then(function(jwt) {
            // console.info('JWT:', jwt);
            return jwt;
        });
    });
}

export default EC;