const {chromium}=require('playwright');
// End-to-end check of every page and API flow.
// npm i -D playwright && npx playwright install chromium
// npm run build:preview && npx vite preview --port 4173   (or APP=http://localhost:5173/ with npm run dev)
// node tests/e2e.cjs
const URL=process.env.APP||'http://localhost:4173/';
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+m)};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1920,height:1080}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const W=ms=>p.waitForTimeout(ms);
await p.goto(URL);await W(800);
// --- login
await p.click('button[type=submit]');await W(200);ok(await p.isVisible('text=Enter your User ID'),'login: empty user id message');
await p.fill('#userId','admin');await p.fill('#password','wrong');await p.click('button[type=submit]');await W(700);ok(await p.isVisible('text=Incorrect User ID or Password'),'login: wrong password rejected');
await p.fill('#password','Admin');await p.click('button[aria-label="Show password"]');ok(await p.getAttribute('#password','type')==='text','login: show password');
await p.click('button[type=submit]');await W(1500);ok(p.url().includes('#/dashboard'),'login: admin signs in → dashboard');
// --- dashboard
ok(await p.isVisible('text=Inoculation Parameters')&&await p.isVisible('text=50 kg').catch(()=>false)||await p.isVisible('text=Bunch Weight'),'dashboard: summary loaded from API');
ok((await p.$$('main .recharts-line-dots circle')).length===1,'dashboard: cumulative chart drawn with last-value dot');
const hdr=await p.textContent('header');ok(/14:00:23.*B-80.*Over Dose/.test(hdr),'header: live alert banner');
await p.click('header button:has-text("Acknowledge")');await W(700);ok(/13:25:10.*B-72/.test(await p.textContent('header')),'header: acknowledge → next alert (API)');
ok((await p.$$('main li button:has-text("Acknowledge")')).length===1,'dashboard: alerts list updated after acknowledge');
await p.hover('main button[aria-label^="B-66"]');await W(250);ok(await p.isVisible('text=Under Dose >> nth=0'),'dashboard: box tooltip');
await p.click('main button[aria-label^="B-71"]');await W(900);ok(await p.isVisible('[aria-label="Box details"]')&&(await p.textContent('[aria-label="Box details"]')).includes('Dose Miss'),'dashboard: box detail pop-up (API)');
await p.click('[aria-label="Next box"]');await W(700);ok((await p.textContent('[aria-label="Box details"]')).includes('B-72'),'box detail: next box');
await p.keyboard.press('Escape');await W(200);ok(!(await p.isVisible('[aria-label="Box details"]')),'box detail: Esc closes');
await p.click('button[aria-label="Switch graph"]');await p.click('[role=option]:has-text("Dosage Across Molds")');await W(900);ok((await p.$$('main .recharts-bar-rectangle')).length>=20,'dashboard: across-molds chart (API)');
await p.click('button[aria-label="Chart component"]');await p.click('[role=option]:has-text("Component 3")');await W(800);ok(await p.isVisible('button[aria-label="Chart component"]:has-text("Component 3")'),'dashboard: component filter');
await p.click('button[aria-label="Select machine and production line"]');await p.click('[role=option]:has-text("Inodose Machine 2")');await W(800);ok(await p.isVisible('header button:has-text("Inodose Machine 2")'),'header: machine selector');
// --- control panel
await p.click('aside nav >> text=Control Panel');await W(1200);
ok(await p.isDisabled('main button:has-text("Apply")'),'cp: Apply disabled until a change');
await p.click('button[aria-label="Edit Pouring time in seconds"]');await p.keyboard.press('Control+A');await p.keyboard.type('400');await p.keyboard.press('Enter');await W(200);ok(await p.isVisible('text=Enter 1 – 300'),'cp: out-of-range value rejected');
await p.keyboard.press('Control+A');await p.keyboard.type('25');await p.keyboard.press('Enter');await W(200);ok(await p.isVisible('text=100 gms'),'cp: inoculant weight recalculated (25×4)');
await p.click('main button:has-text("Manual Mode")');await p.click('main button:has-text("Apply")');await W(300);
const dlg=await p.textContent('[role=dialog]');ok(/Manual Mode/.test(dlg)&&/25 sec/.test(dlg)&&/4 gms\/sec/.test(dlg),'cp: confirmation lists mode + parameters');
await p.click('[role=dialog] button:has-text("Apply changes")');await W(900);ok(await p.isDisabled('main button:has-text("Apply")'),'cp: settings applied (API)');
await p.click('main button:has-text("Open") >> nth=0');await W(2300);ok(await p.isVisible('text=Opened')&&/Time Elapsed - \d+ sec/.test(await p.textContent('main')),'cp: manual operation runs, elapsed counts');
ok(/Inoculant Dosed: \d+/.test(await p.textContent('main')),'cp: inoculant dosed shown');
await p.click('main button:has-text("Close") >> nth=0');await W(700);ok(await p.isVisible('text=Closed >> nth=0'),'cp: close operation');
// --- past records
await p.click('aside nav >> text=Past Records');await W(1200);
ok((await p.$$('main tbody > tr')).length===10,'pr: first page of days (API, 10 per page)');
await p.click('nav[aria-label=Pagination] button:has-text("2")');await W(700);ok((await p.$$('main tbody > tr')).length===3,'pr: page 2');
await p.click('nav[aria-label=Pagination] button:has-text("1")');await W(700);
await p.click('main tbody tr:has-text("04-Oct-2026")');await W(500);ok(await p.isVisible('text=C.I. ADAPTER 1.5” BOTTOM'),'pr: expand day → components');
await p.click('main tbody tr:has-text("C.I. ADAPTER 2” TOP") >> nth=0');await W(800);ok(await p.isVisible('text=12345'),'pr: expand component → doses (API)');
await p.click('main tr:has-text("12345")');await W(900);ok(await p.isVisible('[role=dialog]:has-text("Dose ID")'),'pr: dose graph pop-up (API)');await p.keyboard.press('Escape');await W(300);
await p.click('main button:has-text("View Graph") >> nth=0');await W(900);ok(await p.isVisible('[role=dialog]:has-text("Dosage Across Molds")'),'pr: View Graph pop-up (API)');await p.keyboard.press('Escape');await W(300);
await p.click('button[aria-label="Filter by component"]');await p.click('[role=option]:has-text("Component 3")');await p.click('main button:has-text("Apply")');await W(900);
const rows=await p.$$eval('main tbody > tr',r=>r.map(x=>x.textContent));ok(rows.length>0&&rows.every(t=>/1 Components/.test(t)),'pr: component filter applied (API)');
await p.click('button[aria-label="Filter by component"]');await p.click('[role=option]:has-text("All")');await p.click('main button:has-text("Apply")');await W(600);await p.click('[role=tab]:has-text("Alerts")');await W(900);ok((await p.$$('main tbody tr')).length>0,'pr: alerts tab (API)');
const before=(await p.$$('main tbody button:has-text("Acknowledge")')).length;if(before){await p.click('main tbody button:has-text("Acknowledge") >> nth=0');await W(700);}
ok((await p.$$('main tbody button:has-text("Acknowledge")')).length===Math.max(0,before-1),'pr: acknowledge past alert (API)');
// --- configurations
await p.click('aside nav >> text=Configurations');await W(1000);
await p.click('main button:has-text("Add New Component")');await p.click('[role=dialog] button:has-text("Add Component")');await W(200);ok(await p.isVisible('text=Component ID is required'),'cfg: component form validation');
const fill=async(l,v)=>p.fill(`[role=dialog] label:has-text("${l}") + div input`,v);
await fill('Component ID','C-200');await fill('Component Name','Test Adapter');await fill('Pouring Temp. min','1300');await fill('Pouring Temp. max','1350');await fill('Pouring Time','15');await fill('Inoculant Flow-Rate','5');await fill('Expected Dosage','75');await fill('Grade','FG300');await fill('Bunch Weight','30');
await p.click('[role=dialog] button:has-text("Add Component")');await W(900);ok(await p.isVisible('main td:has-text("Test Adapter")'),'cfg: add component (API)');
await p.click('main tr:has-text("Test Adapter") input[type=checkbox]',{force:true});await p.click('main button:has-text("Edit")');await fill('Grade','FG350');await p.click('[role=dialog] button:has-text("Save Changes")');await W(900);ok(await p.isVisible('main td:has-text("FG350")'),'cfg: edit component (API)');
await p.click('main tr:has-text("Test Adapter") input[type=checkbox]',{force:true});await p.click('main button:has-text("Delete")');await p.click('[role=dialog] button:has-text("Delete")');await W(900);ok(!(await p.isVisible('main td:has-text("Test Adapter")')),'cfg: delete component (API)');
await p.click('[role=tab]:has-text("Alerts")');await W(800);await p.click('main tr:has-text("Fault Stepper Motor") input[type=checkbox]',{force:true});await p.click('main button:has-text("Save Changes")');await W(900);ok(await p.isVisible('main tr:has-text("Fault Stepper Motor") >> text=Enabled'),'cfg: alert settings saved (API)');
await p.click('[role=tab]:has-text("Machines")');await W(600);await p.click('main button:has-text("Add New Machine")');
await fill('Product ID','55500');await fill('Machine Name','Inodose Machine 4');await fill('Production Line','Production Line 4');await p.click('[role=dialog] button:has-text("Add Machine")');await W(1100);ok(await p.isVisible('main td:has-text("Inodose Machine 4")'),'cfg: Add New Machine works (API)');
await p.click('[role=tab]:has-text("Administration")');await W(600);
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('main button:has-text("Upload logo")')]);
await fc.setFiles({name:'l.png',mimeType:'image/png',buffer:require('fs').readFileSync(require('path').resolve(__dirname,'../src/assets/images/mpm-mark.png'))});await W(900);
ok(await p.isVisible('text=Logo updated'),'cfg: customer logo upload (API)');ok((await p.getAttribute('header img[alt="Gujarat Metal Cast"]','src')).startsWith('data:image/png'),'header shows new logo');
await p.click('main button:has-text("Restore default")');await W(700);
// --- audit + sign out
await p.click('button[aria-label="Account menu"]');await p.click('[role=menuitem]:has-text("Audit Log")');await W(900);const audit=await p.textContent('[role=dialog]');ok(/Settings applied/.test(audit)&&/Manual operation/.test(audit)&&/Component added/.test(audit),'audit log records actions (API)');await p.keyboard.press('Escape');await W(300);
// stay signed in → reload keeps session
await p.reload();await W(1500);ok(p.url().includes('#/configurations'),'stay signed in: reload keeps session');
await p.click('button[aria-label="Account menu"]');await p.click('[role=menuitem]:has-text("Sign out")');await W(800);ok(p.url().includes('#/login'),'sign out');
// --- operator role
await p.fill('#userId','operator');await p.fill('#password','UmbN-haRr-da5D');await p.click('button[type=submit]');await W(1500);
await p.click('aside nav >> text=Control Panel');await W(1000);ok(await p.isDisabled('main button:has-text("Manual Mode")')&&await p.isDisabled('button[aria-label="Edit Pouring time in seconds"]'),'operator: cannot operate machine');
await p.click('aside nav >> text=Configurations');await W(800);ok(await p.isDisabled('main button:has-text("Add New Component")'),'operator: cannot change configuration');
await p.click('button[aria-label="Account menu"]');ok(!(await p.isVisible('[role=menuitem]:has-text("Audit Log")')),'operator: no audit log');
console.log(`\n${pass} passed, ${fail} failed; page errors: ${errs.length}`,JSON.stringify(errs.slice(0,4)));await b.close();})();
