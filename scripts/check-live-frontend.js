// Syntax and import checks only; does not bundle or build the frontend.
const fs=require('fs');
const path=require('path');
const parser=require('@babel/parser');
const assert=require('node:assert/strict');
const files=['src/App.js','src/components/Login.js','src/components/Dashboard.js','src/components/MemberProfile.js','src/components/ShareMarketConnected.js','src/components/MarketAlerts.js','src/services/portalApi.js','src/pages/api/loan-statement.js'];
for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  const ast=parser.parse(source,{sourceType:'module',plugins:['jsx']});
  for(const statement of ast.program.body){
    if(statement.type==='ImportDeclaration' && statement.source.value.startsWith('.')){
      const target=path.resolve(path.dirname(file),statement.source.value);
      assert.ok([target,target+'.js',target+'.mjs',path.join(target,'index.js')].some(p=>fs.existsSync(p)),`Missing import in ${file}: ${statement.source.value}`);
    }
  }
  assert.ok(!/DEMO_DATA|ShareMarketDemo|createDemoMarket|isMarketPreview/.test(source),`Demo reference in ${file}`);
  console.log('PASS',file);
}
