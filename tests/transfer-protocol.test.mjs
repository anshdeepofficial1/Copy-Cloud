import test from "node:test";
import assert from "node:assert/strict";
import { generateCode, randomToken, fromBase64Url, safeRelativePath, sha256, importTransferKey, encryptChunk, decryptChunk } from "../src/lib/transferProtocol.mjs";
test("codes and tokens use the expected format",()=>{
  for(let i=0;i<100;i++)assert.match(generateCode(),/^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(fromBase64Url(randomToken()).length,32);
});
test("preserve Unicode paths and reject traversal",()=>{
  assert.equal(safeRelativePath("Photos/日本語 photo.png"),"Photos/日本語 photo.png");
  for(const p of ["../a","x/../a","/a","x\\a","C:/a","x//a"])assert.throws(()=>safeRelativePath(p));
});
test("SHA-256 known vector",async()=>assert.equal(await sha256(new TextEncoder().encode("abc")),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
test("AES-GCM authenticates data and context",async()=>{
  const key=await importTransferKey(randomToken());
  const ctx={transferId:"transfer",itemId:"item",index:0};
  const input=new TextEncoder().encode("CopyCloud test");
  const sealed=await encryptChunk(key,input,ctx);
  assert.deepEqual(await decryptChunk(key,sealed.ciphertext,sealed.iv,ctx),input);
  await assert.rejects(decryptChunk(key,sealed.ciphertext,sealed.iv,{...ctx,index:1}));
  const altered=sealed.ciphertext.slice();altered[0]^=1;
  await assert.rejects(decryptChunk(key,altered,sealed.iv,ctx));
  await assert.rejects(decryptChunk(await importTransferKey(randomToken()),sealed.ciphertext,sealed.iv,ctx));
});
