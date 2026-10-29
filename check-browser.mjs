import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Use a real Chromium input session: dispatchEvent alone does not exercise IME state.
const root=new URL('./',import.meta.url);
const files=new Map([
 ['/', ['index.html','text/html']], ['/index.html',['index.html','text/html']],
 ['/app.js',['app.js','text/javascript']], ['/style.css',['style.css','text/css']],
 ...['champions.json','augments.json','champion-stats.json'].map(name=>['/'+name,[name,'application/json']])
]);
const server=createServer(async(req,res)=>{
 const entry=files.get(new URL(req.url,'http://localhost').pathname);
 if(!entry){res.writeHead(404).end();return}
 try{res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8'});res.end(await readFile(new URL(entry[0],root)))}
 catch(error){res.writeHead(500).end(String(error))}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch();
 const origin=`http://127.0.0.1:${server.address().port}`;
 for(const [route,id,word,expectedResult] of [
  ['augments','augment-search','신비한 주먹','신비한 주먹 상세 보기'],
  ['champions','champ-search','아우렐리온 솔','아우렐리온 솔 선택'],
  ['home','champ-search','아리','아리 선택']
 ]){
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(`${origin}/#${route}`);
  const selector='#'+id;
  const input=await page.waitForSelector(selector);
  await input.focus();
  const cdp=await page.context().newCDPSession(page);
  const check=async(value,start=value.length,end=start)=>{
   const current=await input.evaluate((el,selector)=>({
    same:document.querySelector(selector)===el,connected:el.isConnected,
    focused:document.activeElement===el,value:el.value,
    start:el.selectionStart,end:el.selectionEnd
   }),selector);
   assert.deepEqual(current,{same:true,connected:true,focused:true,value,start,end},`${route}: input, focus, value and selection must survive each IME update`);
  };
  const compose=async(text)=>cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
  let prefix='';
  for(const char of word){
   if(char===' '){await cdp.send('Input.insertText',{text:char})}
   else{
    await compose('ㅇ');await check(prefix+'ㅇ');
    await compose(char);await check(prefix+char);
    await cdp.send('Input.insertText',{text:char});
   }
   prefix+=char;await check(prefix);
  }
  assert.equal(await page.getByRole('button',{name:expectedResult,exact:true}).count(),1);

  // An unfinished new syllable can be canceled without deleting committed text.
  await compose('ㅎ');await check(word+'ㅎ');
  await compose('');await check(word);
  // Backspace, clear, paste and Latin input keep the original input too.
  await page.keyboard.press('Backspace');await check(word.slice(0,-1));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');await check('');
  await cdp.send('Input.insertText',{text:word});await check(word);
  // Replace text in the middle and retain a non-collapsed selection.
  await page.keyboard.press('Home');
  await cdp.send('Input.insertText',{text:'가'});await check('가'+word,1);
  await page.keyboard.press('Shift+ArrowRight');await check('가'+word,1,2);
  await cdp.send('Input.insertText',{text:'나'});await check('가나'+word.slice(1),2);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Ahri');await check('Ahri');
  assert.deepEqual(errors,[],`${route}: no browser errors`);
  console.log(`PASS: ${route} native IME multi-syllable input, same DOM node, focus, caret, cancellation, deletion, paste, selection replacement and Latin typing`);
  await page.close();
 }
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
