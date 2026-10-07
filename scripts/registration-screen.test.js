// Browser-like interaction tests with mocked fetch. No server, SMS or database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { JSDOM } = require('jsdom');
const { transformSync } = require('@babel/core');

test('registration opens the OTP step, focuses the input and can resume without sending', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/create-account' });
  const originals = {};
  for (const [key,value] of Object.entries({ window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true })) {
    originals[key]=Object.getOwnPropertyDescriptor(global,key);
    Object.defineProperty(global,key,{value,writable:true,configurable:true});
  }
  const React = require('react');
  const { act, Simulate } = require('react-dom/test-utils');
  const { createRoot } = require('react-dom/client');
  const filename=path.join(__dirname,'../src/components/CreateAccount.js');
  const compiled=transformSync(fs.readFileSync(filename,'utf8'),{filename,babelrc:false,configFile:false,presets:[require.resolve('@babel/preset-react')],plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  const component=new Module(filename,module);component.filename=filename;component.paths=module.paths;
  const originalRequire=component.require.bind(component);
  component.require=name=>name==='react-router-dom'?{useNavigate:()=>()=>{}}:name==='../log.png'?'logo':name==='./Alert'?{__esModule:true,default:({children})=>React.createElement('div',{role:'status'},children)}:originalRequire(name);
  component._compile(compiled,filename);
  const root=createRoot(document.getElementById('root'));
  const originalFetch=global.fetch;
  let calls=0;
  global.fetch=async()=>{calls++;return {ok:true,json:async()=>({message:'OTP queued for your registered phone.'})};};
  const change=async(name,value)=>act(async()=>{Simulate.change(document.querySelector(`[name="${name}"]`),{target:{name,value}});});
  const clickText=async text=>act(async()=>{Simulate.click([...document.querySelectorAll('button')].find(button=>button.textContent===text));});
  try {
    await act(async()=>root.render(React.createElement(component.exports.default)));
    await change('memberNo','999999');
    await act(async()=>{Simulate.submit(document.querySelector('form'));});
    assert.equal(calls,1);
    assert.equal(document.querySelector('h2').textContent,'Verify OTP & set your password');
    assert.equal(document.querySelector('fieldset').hidden,true);
    assert.equal(document.activeElement.id,'registration-otp');
    assert.ok(document.querySelector('#registration-password'));
    await clickText('Correct my details');
    assert.equal(document.querySelector('fieldset').hidden,false);
    await clickText('I already have an OTP');
    assert.equal(calls,1,'Resuming must not send another OTP');
    assert.equal(document.activeElement.id,'registration-otp');
    await clickText('Correct my details');
    global.fetch=async()=>({ok:false,json:async()=>({message:'Phone number does not match.'})});
    await act(async()=>Simulate.submit(document.querySelector('form')));
    assert.equal(document.querySelector('fieldset').hidden,false);
    assert.match(document.body.textContent,/Phone number does not match/);
  } finally {
    await act(async()=>root.unmount());global.fetch=originalFetch;dom.window.close();
    for(const key of Object.keys(originals)) {if(originals[key])Object.defineProperty(global,key,originals[key]);else delete global[key];}
  }
});
