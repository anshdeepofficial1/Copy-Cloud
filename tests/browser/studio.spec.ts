import { test,expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("unified draft, JSON, attachments and PDF preview",async({page})=>{
  await page.goto("/workspace");
  const message=page.getByRole("textbox",{name:"Transfer message"});
  await message.fill('{"hello":"CopyCloud","n":2}');
  await page.getByRole("button",{name:"Format JSON"}).click();
  await expect(message).toHaveValue('{\n  "hello": "CopyCloud",\n  "n": 2\n}');
  const pdf=await PDFDocument.create();const p=pdf.addPage([400,300]);const font=await pdf.embedFont(StandardFonts.Helvetica);p.drawText("CopyCloud PDF",{x:40,y:200,size:25,font});
  const bytes=Buffer.from(await pdf.save());
  const picker=page.locator('input[type=file]:not([webkitdirectory])');
  await picker.setInputFiles([{name:"original.pdf",mimeType:"application/pdf",buffer:bytes},{name:"notes.txt",mimeType:"text/plain",buffer:Buffer.from("hello")}]);
  await expect(page.getByText("original.pdf",{exact:true})).toBeVisible();
  page.once("dialog",d=>d.accept("日本語 notes.txt"));
  await page.getByRole("button",{name:"Rename notes.txt",exact:true}).click();
  await expect(page.getByText("日本語 notes.txt",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Move 日本語 notes.txt up",exact:true}).click();
  await page.getByRole("button",{name:"Preview original.pdf",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"original.pdf"})).toBeVisible();
  await expect(page.locator(".ts-pdf-sheet")).toBeVisible();
  await expect.poll(async()=>page.locator(".ts-pdf-sheet canvas").evaluate((canvas:HTMLCanvasElement)=>{
    const context=canvas.getContext("2d");if(!context)return false;
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;
    let dark=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&data[i]<100&&data[i+1]<100&&data[i+2]<100)dark++;
    return dark>100;
  })).toBeTruthy();
  await page.getByRole("button",{name:"Close preview"}).click();
  await expect(page.getByRole("button",{name:"Create transfer"})).toBeEnabled();
});
test("real nearby WebRTC text and file delivery between two browser contexts",async({browser,baseURL})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  try{
    const sender=await a.newPage(),receiver=await b.newPage();
    await sender.goto(baseURL+"/workspace");
    await sender.getByRole("textbox",{name:"Transfer message"}).fill("Real encrypted peer test");
    const file=Buffer.from("CopyCloud byte-for-byte peer payload");
    await sender.locator('input[type=file]:not([webkitdirectory])').setInputFiles({name:"peer-test.txt",mimeType:"text/plain",buffer:file});
    await sender.getByLabel("Transfer mode").selectOption("nearby");
    await sender.getByRole("button",{name:"Create pairing link"}).click();
    const offer=sender.getByLabel("Pairing link",{exact:true});
    await expect(offer).toHaveValue(/#ccp=/,{timeout:30000});
    await receiver.goto(await offer.inputValue());
    await receiver.getByRole("button",{name:"Generate response"}).click();
    const answer=receiver.getByLabel("Receiver response",{exact:true});
    await expect(answer).not.toHaveValue("",{timeout:30000});
    await sender.getByLabel("Pairing response",{exact:true}).fill(await answer.inputValue());
    await sender.getByRole("button",{name:"Connect and send"}).click();
    await receiver.getByRole("button",{name:"Accept in browser"}).click({timeout:60000});
    await expect(receiver.getByText("Real encrypted peer test",{exact:true})).toBeVisible({timeout:60000});
    await expect(sender.getByText("Transfer complete. Receiver confirmed all bytes.")).toBeVisible();
    const downloadPromise=receiver.waitForEvent("download");
    await receiver.getByRole("button",{name:"Download peer-test.txt"}).click();
    const download=await downloadPromise;expect(download.suggestedFilename()).toBe("peer-test.txt");
    expect(await readFile((await download.path())!)).toEqual(file);
  }finally{await a.close();await b.close()}
});
test("mobile workspace keeps controls visible without horizontal overflow",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/workspace");
  await expect(page.getByRole("textbox",{name:"Transfer message"})).toBeVisible();
  await expect(page.getByLabel("Transfer mode")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
});
