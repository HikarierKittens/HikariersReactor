const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const file of ['test-asriel.cjs','test-moon.cjs','test-factory-upgrades.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit',cwd:path.join(__dirname,'..')});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
console.log('All retained regression suites passed.');
