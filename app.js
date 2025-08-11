let currentVendorFilter = null;
let currentSearchTerm = "";

// remember last PO searched (for WhatsApp auto request)
let lastSearchPO = "";

// cache & collection
const lastRenderedRows = {};
let selectedPOs = {};
try { selectedPOs = JSON.parse(localStorage.getItem('selectedPOs') || '{}'); } catch { selectedPOs = {}; }

// WhatsApp target number
const WHATSAPP_REQUEST_NUMBER = "5099 2079";

// --- Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyC7cfmocz3oPyERDIiJj5XIDeA3wc6rQZI",
  authDomain: "progress-po.firebaseapp.com",
  projectId: "progress-po",
  storageBucket: "progress-po.firebasestorage.app",
  messagingSenderId: "100311283897",
  appId: "1:100311283897:web:0dc641fd38df3f241f8368",
  measurementId: "G-YYE9BBQ9SE"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// Show/hide admin section + login button state
auth.onAuthStateChanged(user => {
  document.getElementById('adminSection')?.classList.toggle('hidden', !user);

  const btn = document.getElementById('loginBtn');
  if (btn) {
    btn.textContent = user ? "Logout" : "Login";
    if (user) btn.classList.add("logout"); else btn.classList.remove("logout");
    btn.onclick = user ? logout : toggleLoginModal;
  }
});

function login() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
}
function logout() { auth.signOut(); }

// ---------- CSV helpers ----------
function parseCSV(raw) {
  return raw.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).map(l=>l.split(",").map(v=>v.trim()));
}
function csvHeadersOK(arr) {
  if (!arr || arr.length === 0) return false;
  const h = arr[0].map(x => x.toLowerCase());
  const want = ["site","po","id no","vendor","value"];
  return want.every((w,i) => (h[i] || "") === w);
}
function toNumberOrRaw(v){ const n=parseFloat(v); return isNaN(n)? v : n; }
function downloadCSV(name, headerLine){
  const blob=new Blob([headerLine+"\n"],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- Templates ----------
function downloadMainTemplate(){ downloadCSV("progress_po_template.csv","Site,PO,ID No,Vendor,Value"); }
function downloadMasterTemplate(){ downloadCSV("master_po_template.csv","Site,PO,ID No,Vendor,Value"); }

// ---------- Upload to records (Main) ----------
function uploadCSV(){
  const file=document.getElementById('csvUpload').files[0];
  if(!file) return alert("Select a file");
  const reader=new FileReader();
  reader.onload=e=>{
    const rows=parseCSV(e.target.result);
    if(!csvHeadersOK(rows)) return alert('Invalid template. Header must be exactly: "Site,PO,ID No,Vendor,Value".');
    const body=rows.slice(1); const updates={};
    body.forEach(cols=>{
      const [Site,PO,IDNo,Vendor,Value]=cols;
      if(Site && PO){ const ref=db.ref('records').push(); updates[ref.key]={Site,PO,IDNo,Vendor,Value:toNumberOrRaw(Value)}; }
    });
    db.ref('records').update(updates).then(()=>alert("Upload complete")).catch(err=>alert(err.message));
  };
  reader.readAsText(file);
}

// ---------- Upload to master-po ----------
function uploadMasterPO(){
  const file=document.getElementById('masterUpload').files[0];
  if(!file) return alert("Select a file");
  if(!auth.currentUser) return alert("Login required.");
  const reader=new FileReader();
  reader.onload=e=>{
    const rows=parseCSV(e.target.result);
    if(!csvHeadersOK(rows)) return alert('Invalid template. Header must be exactly: "Site,PO,ID No,Vendor,Value".');
    const body=rows.slice(1); const updates={};
    body.forEach(cols=>{
      const [Site,PO,IDNo,Vendor,Value]=cols;
      if(PO && Site){ updates[PO]={Site,PO,IDNo,Vendor,Value:toNumberOrRaw(Value)}; }
    });
    db.ref('master-po').update(updates).then(()=>alert("Master PO upload complete")).catch(err=>alert("Upload failed: "+err.message));
  };
  reader.readAsText(file);
}
function deleteAllMasterPO(){
  if(!auth.currentUser) return alert("Login required.");
  if(!confirm("Delete ALL master-po records?")) return;
  db.ref('master-po').remove().then(()=>alert("All master-po records deleted")).catch(err=>alert(err.message));
}

// ---------- UI helpers ----------
function formatNumber(val){ const num=parseFloat(val); if(isNaN(num)) return val??""; return num.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function generateAZFilter(){
  const c=document.getElementById("letterFilter"); "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter=>{
    const btn=document.createElement("button"); btn.textContent=letter; btn.onclick=()=>filterByVendorLetter(letter); c.appendChild(btn);
  });
}
function renderRow(childKey, data){
  lastRenderedRows[childKey]=data;
  const checked = selectedPOs[childKey] ? 'checked' : '';
  const tr=document.createElement('tr');
  tr.innerHTML =
    `<td><input type="checkbox" class="rowSelect" data-key="${childKey}" ${checked}></td>
     <td>${data.Site||""}</td>
     <td>${data.PO||""}</td>
     <td>${data.IDNo||""}</td>
     <td>${data.Vendor||""}</td>
     <td>${formatNumber(data.Value)}</td>
     <td><button onclick="showDeleteConfirm('${childKey}')">Delete</button></td>`;
  return tr;
}
function updateResultCount(){
  const count=document.querySelectorAll('#poTable tbody tr').length;
  const el=document.getElementById('resultCount');
  if (el) el.textContent = count>0 ? `Total Results: ${count}` : '';
  const bar=document.getElementById('noResultsBar');
  if (bar) bar.classList.toggle('hidden', count!==0);
}

// ---- COLLECTION helpers ----
function persistSelected(){ localStorage.setItem('selectedPOs', JSON.stringify(selectedPOs)); updateSelectedCount(); }
function updateSelectedCount(){ const btn=document.getElementById('viewCollectionBtn'); if(btn) btn.textContent=`View (${Object.keys(selectedPOs).length})`; }
function addCheckedToCollection(){
  const checks=document.querySelectorAll('#poTable tbody input.rowSelect:checked');
  if(!checks.length){ alert("No rows selected."); return; }
  checks.forEach(chk=>{ const key=chk.getAttribute('data-key'); if(key && lastRenderedRows[key]) selectedPOs[key]=lastRenderedRows[key]; });
  persistSelected();
}
function viewCollection(){
  const tbody=document.querySelector('#poTable tbody'); tbody.innerHTML='';
  Object.keys(selectedPOs).forEach(key=>tbody.appendChild(renderRow(key, selectedPOs[key])));
  updateResultCount();
}
function clearCollection() {
  if (!confirm("Clear all items in the collection?")) return;

  // reset stored collection
  selectedPOs = {};
  persistSelected();

  // clear any checkboxes (if rows still present)
  document.querySelectorAll('#poTable tbody input.rowSelect').forEach(chk => chk.checked = false);

  // ✅ also clear the table UI
  const tbody = document.querySelector('#poTable tbody');
  if (tbody) tbody.innerHTML = '';

  // hide the no-results WhatsApp bar (same behavior as after sending)
  const bar = document.getElementById('noResultsBar');
  if (bar) bar.classList.add('hidden');

  updateResultCount();
}


// ---------- Search / Filter ----------
function filterByVendorLetter(letter){
  currentVendorFilter=letter; currentSearchTerm="";
  db.ref('records').once('value', snap=>{
    const tbody=document.querySelector('#poTable tbody'); tbody.innerHTML='';
    snap.forEach(child=>{ const d=child.val(); if((d.Vendor||"").toUpperCase().startsWith(letter)) tbody.appendChild(renderRow(child.key,d)); });
    updateResultCount();
  });
}

function searchRecords(){
  currentSearchTerm=(document.getElementById('searchBox').value||"").toLowerCase();
  lastSearchPO = document.getElementById('searchBox').value || "";
  currentVendorFilter=null;

  db.ref('records').once('value', snapshot=>{
    const tbody=document.querySelector('#poTable tbody'); tbody.innerHTML='';
    snapshot.forEach(child=>{
      const d=child.val();
      if(
        (d.PO||"").toLowerCase().includes(currentSearchTerm) ||
        (d.Site||"").toLowerCase().includes(currentSearchTerm) ||
        (d.Vendor||"").toLowerCase().includes(currentSearchTerm) ||
        (d.IDNo||"").toLowerCase().includes(currentSearchTerm)
      ){
        tbody.appendChild(renderRow(child.key,d));
      }
    });
    updateResultCount();
  });
}

function clearSearch(){
  currentSearchTerm=""; currentVendorFilter=null;
  document.getElementById('searchBox').value='';
  document.querySelector('#poTable tbody').innerHTML='';
  updateResultCount();
}

// ---------- Delete flow ----------
let deleteKeyPending=null;
function showDeleteConfirm(key){ deleteKeyPending=key; document.getElementById("deleteConfirmModal").classList.remove("hidden"); }
function proceedDelete(){
  if(deleteKeyPending){ deleteRecord(deleteKeyPending); deleteKeyPending=null; }
  document.getElementById("deleteConfirmModal").classList.add("hidden");
}
function cancelDelete(){ deleteKeyPending=null; document.getElementById("deleteConfirmModal").classList.add("hidden"); }
function deleteRecord(key){
  if(!auth.currentUser){ alert("Only admin can delete"); return; }

  db.ref('records/' + key).remove().then(() => {
    // keep local caches in sync
    if (selectedPOs[key]) { delete selectedPOs[key]; persistSelected(); }
    if (lastRenderedRows[key]) { delete lastRenderedRows[key]; }

    // remove just the deleted row from the current table (no refresh)
    const rowCheckbox = document.querySelector(`#poTable tbody input.rowSelect[data-key="${key}"]`);
    const row = rowCheckbox ? rowCheckbox.closest('tr') : null;
    if (row) row.remove();

    // update counts / empty-state UI
    updateResultCount();
  }).catch(err => alert(err.message));
}


// ---------- Menu / Tabs ----------
function toggleMenu(){ document.getElementById('sideMenu').classList.toggle('show'); }
function showTab(tabId){
  document.querySelectorAll('.tabContent').forEach(tab=>tab.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  const menu=document.getElementById('sideMenu'); if(menu.classList.contains('show')) menu.classList.remove('show');
}
document.getElementById("searchBox").addEventListener("keyup", e=>{ if(e.key==="Enter"){ searchRecords(); document.getElementById('searchBox').value=''; } });

window.onload = ()=>{ generateAZFilter(); updateSelectedCount(); };

// ---------- Login modal ----------
function toggleLoginModal(){ document.getElementById('loginModal').classList.toggle('hidden'); }
function popupLogin(){
  const email=document.getElementById('popupEmail').value;
  const pass=document.getElementById('popupPassword').value;
  auth.signInWithEmailAndPassword(email, pass).then(()=>toggleLoginModal()).catch(err=>alert("Login failed: "+err.message));
}

// ---------- Add PO from master-po ----------
function promptAddPO(){
  if(!auth.currentUser) return alert("Only admin can add PO");
  const po=prompt("Enter PO number to add:"); if(!po) return;
  const masterRef=db.ref('master-po/'+po); const recordsRef=db.ref('records');
  masterRef.once('value').then(snap=>{
    if(!snap.exists()) return alert("PO not found in master list");
    recordsRef.orderByChild("PO").equalTo(po).once('value', rSnap=>{
      if(rSnap.exists()) return alert("PO already exists in records");
      const data=snap.val(); const newRef=recordsRef.push();
      newRef.set(data).then(()=>{
        alert("PO added to records");
        const tbody=document.querySelector('#poTable tbody');
        tbody.appendChild(renderRow(newRef.key, data));
        updateResultCount();
      });
    });
  });
}

// ---------- WhatsApp request (auto) ----------
function normalizeWhatsAppNumber(num){
  const digits=(num||"").replace(/\D/g,'');
  return digits.length===8 ? '974'+digits : digits; // auto +974 for local 8-digit numbers
}

async function sendWhatsAppRequestAuto() {
  const po = (lastSearchPO || document.getElementById('searchBox').value || "").trim();
  if (!po) { alert("Please enter a PO number first."); return; }

  try {
    // get Vendor from master-po/{po}
    const snap = await firebase.database().ref('master-po/' + po).once('value');
    const data = snap.val() || {};
    const vendor = data.Vendor || "";

    const target = normalizeWhatsAppNumber(WHATSAPP_REQUEST_NUMBER);
    const text = `Requesting original for the following:\nPO: ${po}\nVendor: ${vendor || '-'}`;
    const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank');

    // ✅ Hide request button after sending
    document.getElementById('noResultsBar').classList.add('hidden');

  } catch (e) {
    alert("Could not prepare the WhatsApp message: " + e.message);
  }
}

// expose
window.login=login; window.logout=logout;
window.toggleLoginModal=toggleLoginModal; window.popupLogin=popupLogin;
window.toggleMenu=toggleMenu; window.showTab=showTab;
window.searchRecords=searchRecords; window.clearSearch=clearSearch;
window.showDeleteConfirm=showDeleteConfirm; window.proceedDelete=proceedDelete; window.cancelDelete=cancelDelete;
window.promptAddPO=promptAddPO;
window.uploadCSV=uploadCSV; window.uploadMasterPO=uploadMasterPO; window.deleteAllMasterPO=deleteAllMasterPO;
window.downloadMainTemplate=downloadMainTemplate; window.downloadMasterTemplate=downloadMasterTemplate;
window.addCheckedToCollection=addCheckedToCollection; window.viewCollection=viewCollection; window.clearCollection=clearCollection;
window.sendWhatsAppRequestAuto=sendWhatsAppRequestAuto;
