import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const root = fileURLToPath(new URL('../../', import.meta.url))
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || resolve(root, '.git/perf-tools/node_modules/playwright/index.mjs')).href)
const roots = [resolve(root, process.env.BASELINE_DIST || '.git/perf-baseline/frontend/dist'), resolve(root, process.env.CANDIDATE_DIST || 'frontend/dist')]
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' }
const servers = []
for (let i=0;i<2;i++) {
 const server = createServer(async (req,res) => {
  try {
   let path = new URL(req.url,'http://localhost').pathname
   if (!extname(path)) path='/index.html'
   const content=await readFile(resolve(roots[i], '.'+path))
   res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'public, max-age=3600'}).end(content)
  } catch { res.writeHead(404).end() }
 })
 await new Promise(done=>server.listen(5710+i,'127.0.0.1',done)); servers.push(server)
}
const personnel=Array.from({length:28},(_,i)=>({id:`TEST-${i}`,name:`Officer ${i}`,rank:'Patrol Officer',badge:String(i),status:'On Duty',isOnDuty:true,isLocationStale:false,isVisibleOnMap:true,latitude:17.43+i*.0001,longitude:121.765+i*.0001,locationRecordedAt:new Date().toISOString(),locationStatus:'current',locationName:'Sample location'}))
const reports=Array.from({length:40},(_,i)=>({id:`RPT-${i}`,title:`Sample report ${i}`,officer:`Officer ${i%28}`,personnel_id:`TEST-${i%28}`,report_type:'incident',is_incident:true,severity:3,validation_status:'pending',case_status:'open',date_time:new Date().toISOString(),description:'Synthetic report for frontend performance measurement.',assigned_area:'Sample patrol area',barangay:'Catabayungan',location:'Sample location',latitude:17.43,longitude:121.765}))
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling']})
const results=[]
try {
for(const mode of ['normal','throttled'].filter(value => !process.env.PERF_MODE || value === process.env.PERF_MODE)) for(let variant=0;variant<2;variant++) {
 if (process.env.PERF_VARIANT && String(variant) !== process.env.PERF_VARIANT) continue
 const context=await browser.newContext({viewport:{width:1366,height:900}})
 await context.route('**/*',async route=> {
  const u=new URL(route.request().url())
  if (u.pathname.startsWith('/api/')) {
   let body={data:[],pagination:{totalPages:1,total:0}}
   if(u.pathname==='/api/auth/me') body={user:{id:'perf-supervisor',name:'Test Supervisor',role:'supervisor'}}
   else if(u.pathname==='/api/personnel') body={data:personnel,pagination:{totalPages:1,total:28}}
   else if(u.pathname==='/api/reports') body={data:reports,pagination:{totalPages:1,total:40}}
   else if(u.pathname==='/api/notifications') body={notifications:[]}
   await route.fulfill({json:body}); return
  }
  if(u.pathname.startsWith('/socket.io')) { await route.abort(); return }
  if(u.hostname.includes('maptiler')) { await route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#d5dde5'}}]}}); return }
  if(u.hostname!=='127.0.0.1') {await route.abort();return}
  await route.continue()
 })
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const cdp=await context.newCDPSession(page)
 await cdp.send('Network.enable')
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:mode==='normal'?20:150,downloadThroughput:mode==='normal'?1250000:200000,uploadThroughput:100000})
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:mode==='normal'?1:4})
 await page.addInitScript(()=>{
  window.perfLongTasks=[]
  new PerformanceObserver(list=>window.perfLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})
 })
 await page.goto(`http://127.0.0.1:${5710+variant}/map`,{waitUntil:'domcontentloaded'})
 await page.waitForSelector('.maplibregl-canvas',{timeout:60000})
 await page.waitForTimeout(1500)
 const navigate=async (href,target)=>page.evaluate(({href,target})=>new Promise(resolve=>{
  const start=performance.now();let ready=null;const tasksStart=window.perfLongTasks.length
  document.querySelector(`.nav-sidebar a[href="${href}"]`).click()
  const tick=()=>{const node=document.querySelector(target);if(node){if(ready===null) ready=performance.now()-start;const container=node.closest('.page-container');if(!container||Number(getComputedStyle(container).opacity)>.98){resolve({ready,settled:performance.now()-start,longTasks:window.perfLongTasks.slice(tasksStart),scripts:performance.getEntriesByType('resource').filter(e=>e.startTime>=start&&e.name.endsWith('.js')).map(e=>({file:e.name.split('/').pop(),duration:e.duration,bytes:e.transferSize}))});return}}
  if(performance.now()-start>15000){resolve({error:'timeout',url:location.href});return}requestAnimationFrame(tick)};requestAnimationFrame(tick)
 }),{href,target})
 const cold=await navigate('/personnel','.personnel-page .page-title')
 const warm=[]
 if (process.env.PERF_PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
 for(let i=0;i<5;i++) {
  await page.locator('.nav-sidebar a[href="/map"]').first().click();await page.waitForSelector('.maplibregl-canvas');await page.waitForTimeout(100)
  warm.push(await navigate('/personnel','.personnel-page .page-title'))
 }
 if (process.env.PERF_PROFILE) { const profile=await cdp.send('Profiler.stop'); await (await import('node:fs/promises')).writeFile(resolve(root,'.git/perf-tools/profile.json'),JSON.stringify(profile)) }
 const reportNavigation = await navigate('/reports','.report-list-panel--reports')
 await page.getByRole('button',{name:'View report',exact:true}).first().waitFor()
 const closing=[]
 for(let i=0;i<5;i++) {
  await page.getByRole('button',{name:'View report',exact:true}).first().click()
  await page.waitForSelector('[role="dialog"]')
  await page.locator('.report-map-deferred, .report-location-map').first().scrollIntoViewIfNeeded().catch(()=>{})
  await page.locator('.report-location-map__canvas canvas').waitFor({timeout:15000})
  await page.waitForTimeout(400)
  closing.push(await page.evaluate(()=>new Promise(resolve=>{
   const start=performance.now();const n=window.perfLongTasks.length;let response=null
   document.querySelector('.report-detail-drawer__footer button').click()
   const tick=()=>{if(response===null&&document.querySelector('.is-closing'))response=performance.now()-start
    if(!document.querySelector('.report-drawer-backdrop') && document.body.style.overflow !== 'hidden'){resolve({response,total:performance.now()-start,longTasks:window.perfLongTasks.slice(n),canvasCount:document.querySelectorAll('canvas').length,scrollLock:document.body.style.overflow});return}requestAnimationFrame(tick)};requestAnimationFrame(tick)
  })))
 }
 if (variant === 1 && mode === 'normal') {
  const trigger=page.getByRole('button',{name:'View report',exact:true}).first()
  await trigger.click()
  await page.waitForTimeout(250)
  await page.screenshot({path:resolve(root,'.git/perf-tools/report-drawer.png')})
  await page.keyboard.press('Escape')
  await page.waitForFunction(()=>!document.querySelector('[role="dialog"]') && document.body.style.overflow !== 'hidden')
  if (!await trigger.evaluate(el=>el===document.activeElement)) throw new Error('Close did not restore keyboard focus')
  await page.emulateMedia({reducedMotion:'reduce'})
  await trigger.click()
  await page.getByRole('button',{name:'Close',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('[role="dialog"]') && document.body.style.overflow !== 'hidden')
 }
 results.push({mode,variant:variant?'optimized':'baseline',cold,warm,reportNavigation,closing,errors})
 console.log(JSON.stringify(results.at(-1)))
 await context.close()
}
}finally{await browser.close();servers.forEach(server=>server.close())}
await (await import('node:fs/promises')).writeFile(resolve(root, process.env.PERF_OUTPUT || '.git/perf-tools/results.json'),JSON.stringify({browser:browser.version(),notes:'Production builds; synthetic 28 officers and 40 reports; first navigation after 1.5s idle; mock API and tile-free style; normal=20ms/10Mbps/1x CPU, throttled=150ms/1.6Mbps/4x CPU. Not live-site latency.',results},null,2))
