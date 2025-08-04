
let currentVendorFilter = null;
let currentSearchTerm = "";

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

auth.onAuthStateChanged(user => {
  document.getElementById('adminSection').classList.toggle('hidden', !user);
});

function login() {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  auth.signInWithEmailAndPassword(email, pass).catch(console.error);
}

function logout() {
  auth.signOut();
}

function uploadCSV() {
  const fileInput = document.getElementById('csvUpload');
  const file = fileInput.files[0];
  if (!file) return alert("Select a file");

  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.split('\n');
    lines.slice(1).forEach(line => {
      const [site, po, id, vendor, value] = line.split(',');
      if (site && po) {
        const ref = db.ref('records').push();
        ref.set({ Site: site, PO: po, IDNo: id, Vendor: vendor, Value: value });
      }
    });
    alert("Upload complete");
  };
  reader.readAsText(file);
}

function downloadTemplate() {
  window.open('progress_po_template.csv');
}

function formatNumber(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateAZFilter() {
  const container = document.getElementById("letterFilter");
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  letters.forEach(letter => {
    const btn = document.createElement("button");
    btn.textContent = letter;
    btn.onclick = () => filterByVendorLetter(letter);
    container.appendChild(btn);
  });
}

function filterByVendorLetter(letter) {
  currentVendorFilter = letter;
  currentSearchTerm = "";
  db.ref('records').once('value', snapshot => {
    const tbody = document.querySelector('#poTable tbody');
    tbody.innerHTML = '';
    snapshot.forEach(child => {
      const data = child.val();
      if (data.Vendor && data.Vendor.toUpperCase().startsWith(letter)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${data.Site}</td><td>${data.PO}</td><td>${data.IDNo}</td><td>${data.Vendor}</td><td>${formatNumber(data.Value)}</td><td><button onclick="showDeleteConfirm('${child.key}')">Delete</button></td>`;
        tbody.appendChild(tr);
      }
    });
  });
}

function searchRecords() {
  currentSearchTerm = document.getElementById('searchBox').value.toLowerCase();
  currentVendorFilter = null;
  db.ref('records').once('value', snapshot => {
    const tbody = document.querySelector('#poTable tbody');
    tbody.innerHTML = '';
    snapshot.forEach(child => {
      const data = child.val();
      if (
        (data.PO && data.PO.toLowerCase().includes(currentSearchTerm)) ||
        (data.Site && data.Site.toLowerCase().includes(currentSearchTerm)) ||
        (data.Vendor && data.Vendor.toLowerCase().includes(currentSearchTerm)) ||
        (data.IDNo && data.IDNo.toLowerCase().includes(currentSearchTerm))
      ) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${data.Site}</td><td>${data.PO}</td><td>${data.IDNo}</td><td>${data.Vendor}</td><td>${formatNumber(data.Value)}</td><td><button onclick="showDeleteConfirm('${child.key}')">Delete</button></td>`;
        tbody.appendChild(tr);
      }
    });
  });
}

function clearSearch() {
  currentSearchTerm = "";
  currentVendorFilter = null;
  document.getElementById('searchBox').value = '';
  document.querySelector('#poTable tbody').innerHTML = '';
}

function deleteRecord(key) {
  if (auth.currentUser) {
    db.ref('records/' + key).remove().then(() => {
      if (currentVendorFilter) {
        filterByVendorLetter(currentVendorFilter);
      } else if (currentSearchTerm !== "") {
        searchRecords();
      } else {
        clearSearch();
      }
    });
  } else {
    alert("Only admin can delete");
  }
}

function toggleMenu() {
  const menu = document.getElementById('sideMenu');
  menu.classList.toggle('show');
}

function showTab(tabId) {
  document.querySelectorAll('.tabContent').forEach(tab => tab.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  const menu = document.getElementById('sideMenu');
  if (menu.classList.contains('show')) {
    menu.classList.remove('show');
  }
}

document.getElementById("searchBox").addEventListener("keyup", function(event) {
  if (event.key === "Enter") {
    searchRecords();
  }
});

window.onload = generateAZFilter;


function toggleLoginModal() {
  document.getElementById('loginModal').classList.toggle('hidden');
}

function popupLogin() {
  const email = document.getElementById('popupEmail').value;
  const pass = document.getElementById('popupPassword').value;
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => toggleLoginModal())
    .catch(err => alert("Login failed: " + err.message));
}

auth.onAuthStateChanged(user => {
  const btn = document.getElementById('loginBtn');
  if (btn) {
    btn.textContent = user ? "Logout" : "Login";
    if (user) {
      btn.classList.add("logout");
    } else {
      btn.classList.remove("logout");
    }
    btn.onclick = user ? logout : toggleLoginModal;
  }
});


let deleteKeyPending = null;

function showDeleteConfirm(key) {
  deleteKeyPending = key;
  document.getElementById("deleteConfirmModal").classList.remove("hidden");
}

function proceedDelete() {
  if (deleteKeyPending) {
    deleteRecord(deleteKeyPending);
    deleteKeyPending = null;
  }
  document.getElementById("deleteConfirmModal").classList.add("hidden");
}

function cancelDelete() {
  deleteKeyPending = null;
  document.getElementById("deleteConfirmModal").classList.add("hidden");
}
