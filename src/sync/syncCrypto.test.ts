import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptBlob, encryptBlob, groupIdOf, joinCode, keyFromCode, newGroupKey } from './syncCrypto.ts';

// Shared with the Android app (checked in Python and Node there).
const VECTOR = {
    keyHex: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    joinCode: 'BM1-AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
    groupId: '5de3e947cf9b81bae1f627288fabe566c5ab45e4584ab94004ba3aa6cfd5571f',
    nonceHex: '6465666768696a6b6c6d6e6f',
    plaintext: '{"v":1,"items":[{"phone":"9000000001","name":"Asha","upi":"asha@okhdfc","color":3,"emoji":null,"updatedAt":1762800000000,"deleted":false}]}',
    blob: 'ZGVmZ2hpamtsbW5vGfIqPwPzlEQj2P/1pjfkNm6uEmoUsisAvDJfGDcQtOI0pB7t6tJrZnx7QV1MqJIbKX9kvLp8DG/4YZ3tsphk2jFQE1GFklQx5S/RHlTZXaU0pOiIxIDnyZxZrz4PaadIsvAFrik52ujHTdF25TUe3qz1mXvasUG6+cK4mbMyN97Fyo1c6fjAIZGWCOvJhE8NSUqyVn1cHl/jjfw=',
};
const bytes = (h: string) => Uint8Array.from(h.match(/../g)!, b => parseInt(b, 16));

test('cross-platform vector: same join code, group id and blob as Android', async () => {
    const key = bytes(VECTOR.keyHex);
    assert.equal(joinCode(key), VECTOR.joinCode);
    assert.equal(await groupIdOf(key), VECTOR.groupId);
    assert.equal(await encryptBlob(key, VECTOR.plaintext, bytes(VECTOR.nonceHex)), VECTOR.blob);
    assert.equal(await decryptBlob(key, VECTOR.blob), VECTOR.plaintext);
});

test('join codes and links read back to the key; anything else is refused', () => {
    const key = bytes(VECTOR.keyHex);
    assert.deepEqual(keyFromCode(VECTOR.joinCode), key);
    assert.deepEqual(keyFromCode(` https://teen-patti-bets.netlify.app/#join=${VECTOR.joinCode} `), key);
    assert.equal(keyFromCode('BM1-short'), null);
    assert.equal(keyFromCode(VECTOR.joinCode.replace('BM1', 'BM2')), null);
});

test('a random key round-trips; a wrong key or a damaged blob fails', async () => {
    const key = newGroupKey();
    assert.equal(key.length, 32);
    const blob = await encryptBlob(key, 'héllo ₹');
    assert.equal(await decryptBlob(key, blob), 'héllo ₹');
    await assert.rejects(decryptBlob(newGroupKey(), blob));
    const damaged = blob.slice(0, 20) + (blob[20] === 'A' ? 'B' : 'A') + blob.slice(21);
    await assert.rejects(decryptBlob(key, damaged));
});
