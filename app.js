const DB_NAME = "smart-id-card-maker";
const DB_VERSION = 1;
const STORE = "records";
const SETTINGS_KEY = "smart-id-card-maker-settings-v1";

let db;
let records = [];
let editingPhoto = null;
let currentRecordPhoto = null;
let currentLogo = null;
let cameraStream = null;
let capturedBlob = null;
let toastTimer;

const $ = (id) => document.getElementById(id);
const recordDialog = $("recordDialog");
const cameraDialog = $("cameraDialog");
const recordForm = $("recordForm");
const institutionForm = $("institutionForm");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("personId", "personId", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function storeRequest(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error || new Error("Storage transaction failed."));
  });
}
const getAllRecords = () => storeRequest("readonly", s => s.getAll());
const putRecord = (record) => storeRequest("readwrite", s => s.put(record));
const deleteRecord = (id) => storeRequest("readwrite", s => s.delete(id));

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}
function validateImage(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Choose a valid image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Image is too large. Choose a file under 12 MB.");
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function setMessage(id, message, isError = false) {
  const el = $(id);
  el.textContent = message;
  el.classList.toggle("error", isError);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function getSettings() {
  return { name: "", address: "", phone: "", session: "", colour: "#173b67", logo: null, ...loadSettings() };
}
function applyInstitutionForm() {
  const s = getSettings();
  for (const key of ["name", "address", "phone", "session", "colour"]) {
    if (institutionForm.elements[key]) institutionForm.elements[key].value = s[key] || (key === "colour" ? "#173b67" : "");
  }
  currentLogo = s.logo || null;
  renderLogo();
}
function renderLogo() {
  $("logoPreview").classList.toggle("hidden", !currentLogo);
  $("logoHint").classList.toggle("hidden", !!currentLogo);
  $("removeLogoBtn").classList.toggle("hidden", !currentLogo);
  if (currentLogo) $("logoPreview").src = currentLogo;
}
function showTab(tab) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("recordsPanel").classList.toggle("hidden", tab !== "records");
  $("institutionPanel").classList.toggle("hidden", tab !== "institution");
}
function recordValues() {
  const f = new FormData(recordForm);
  return {
    id: f.get("recordId") || crypto.randomUUID(),
    type: f.get("type"),
    personId: String(f.get("personId") || "").trim(),
    name: String(f.get("name") || "").trim(),
    className: String(f.get("className") || "").trim(),
    role: String(f.get("role") || "").trim(),
    phone: String(f.get("phone") || "").trim(),
    dob: f.get("dob") || "",
    motherName: String(f.get("motherName") || "").trim(),
    fatherName: String(f.get("fatherName") || "").trim(),
    validTill: f.get("validTill") || "",
    notes: String(f.get("notes") || "").trim(),
    photo: currentRecordPhoto,
    updatedAt: new Date().toISOString()
  };
}
function openRecord(record = null) {
  recordForm.reset();
  setMessage("recordMessage", "");
  currentRecordPhoto = record?.photo || null;
  $("dialogTitle").textContent = record ? "Edit record" : "Add record";
  recordForm.elements.recordId.value = record?.id || "";
  recordForm.elements.type.value = record?.type || "student";
  for (const key of ["personId", "name", "className", "role", "phone", "dob", "motherName", "fatherName", "validTill", "notes"]) {
    recordForm.elements[key].value = record?.[key] || "";
  }
  updatePhotoPreview();
  updateCardPreview();
  recordDialog.showModal();
  updateTypeLabels();
}
function updateTypeLabels() {
  const isStudent = recordForm.elements.type.value === "student";
  $("classLabel").firstChild.textContent = isStudent ? "Class / section" : "Department";
  $("roleLabel").firstChild.textContent = isStudent ? "House / optional role" : "Role / designation";
  recordForm.elements.className.placeholder = isStudent ? "e.g. 7 or 7 - A" : "e.g. Science Department";
  recordForm.elements.role.placeholder = isStudent ? "Optional" : "e.g. Science Teacher";
}
function updatePhotoPreview() {
  const img = $("photoPreview");
  img.classList.toggle("hidden", !currentRecordPhoto);
  $("photoPlaceholder").classList.toggle("hidden", !!currentRecordPhoto);
  if (currentRecordPhoto) img.src = currentRecordPhoto;
}
function updateCardPreview() {
  const s = getSettings();
  const type = recordForm.elements.type.value;
  const name = recordForm.elements.name.value.trim() || "Full Name";
  const id = recordForm.elements.personId.value.trim() || "—";
  const rawClassName = recordForm.elements.className.value.trim();
  const className = type === "student" && rawClassName && !/^class\b/i.test(rawClassName)
    ? `Class ${rawClassName}` : rawClassName;
  const role = recordForm.elements.role.value.trim();
  const phone = recordForm.elements.phone.value.trim();
  const dob = recordForm.elements.dob.value;
  const motherName = recordForm.elements.motherName.value.trim();
  const fatherName = recordForm.elements.fatherName.value.trim();
  const validTill = recordForm.elements.validTill.value;
  const displayDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  $("cardInstitution").textContent = s.name || "आपके विद्यालय का नाम";
  $("cardAddress").textContent = s.address || "";
  $("cardSchoolPhone").textContent = s.phone ? (s.address ? "  •  " : "") + "मोबाइल: " + s.phone : "";
  $("cardPersonName").textContent = name;
  $("cardPersonClass").textContent = type === "student" ? (className || "—") : (role || className || "—");
  $("cardPersonPhone").textContent = phone || "—";
  $("cardPersonDob").textContent = dob ? displayDate(dob) : "—";
  $("cardPersonMother").textContent = motherName || "—";
  $("cardPersonFather").textContent = fatherName || "—";
  $("cardPersonValidTill").textContent = validTill ? displayDate(validTill) : "—";
  $("cardPersonAddress").textContent = recordForm.elements.notes.value.trim() || "—";
  $("cardPersonSession").textContent = s.session || "";
  $("cardLogo").classList.toggle("hidden", !s.logo);
  if (s.logo) $("cardLogo").src = s.logo;
  $("cardPersonPhoto").classList.toggle("hidden", !currentRecordPhoto);
  $("cardPhotoFallback").classList.toggle("hidden", !!currentRecordPhoto);
  if (currentRecordPhoto) $("cardPersonPhoto").src = currentRecordPhoto;
  $("cardPreview").style.setProperty("--card-brand", s.colour || "#173b67");
}
function renderRecords() {
  const q = $("searchInput").value.trim().toLowerCase();
  const filter = $("typeFilter").value;
  const filtered = records.filter(r => (filter === "all" || r.type === filter) &&
    [r.name, r.personId, r.className, r.role, r.phone].some(v => String(v || "").toLowerCase().includes(q)));
  $("emptyState").classList.toggle("hidden", records.length > 0);
  $("recordsList").innerHTML = "";
  if (records.length > 0 && filtered.length === 0) {
    $("recordsList").innerHTML = '<div class="empty-state"><h3>No matching records</h3><p>Try another search term or filter.</p></div>';
    return;
  }
  for (const r of filtered) {
    const item = document.createElement("article");
    item.className = "record-item";
    const avatar = document.createElement(r.photo ? "img" : "div");
    avatar.className = "record-avatar";
    if (r.photo) { avatar.src = r.photo; avatar.alt = "Photo of " + r.name; }
    else avatar.textContent = "NO PHOTO";
    const info = document.createElement("div");
    info.className = "record-info";
    const title = document.createElement("strong"); title.textContent = r.name;
    const meta = document.createElement("p");
    meta.textContent = [r.personId, r.className, r.role].filter(Boolean).join(" • ");
    const badge = document.createElement("span"); badge.className = "record-type"; badge.textContent = r.type;
    const actions = document.createElement("div"); actions.className = "record-actions";
    const edit = document.createElement("button"); edit.textContent = "Edit card"; edit.onclick = () => openRecord(r);
    const del = document.createElement("button"); del.textContent = "Delete"; del.className = "delete";
    del.onclick = async () => {
      if (!confirm(`Delete ${r.name} (${r.personId}) from this device? This cannot be undone.`)) return;
      await deleteRecord(r.id); records = records.filter(x => x.id !== r.id); renderRecords(); toast("Record deleted.");
    };
    actions.append(edit, del); info.append(title, meta, badge, actions); item.append(avatar, info); $("recordsList").append(item);
  }
}
async function reloadRecords() { records = await getAllRecords(); records.sort((a,b) => a.name.localeCompare(b.name)); renderRecords(); }
async function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  $("cameraVideo").srcObject = null;
}
async function startCamera() {
  capturedBlob = null;
  $("cameraMessage").textContent = "";
  $("captureBtn").classList.remove("hidden");
  $("useCaptureBtn").classList.add("hidden");
  $("retakeBtn").classList.add("hidden");
  $("cameraCanvas").classList.add("hidden");
  $("cameraVideo").classList.remove("hidden");
  cameraDialog.showModal();
  if (!navigator.mediaDevices?.getUserMedia) {
    $("cameraMessage").textContent = "Camera access is not available in this browser or page context. Use Choose photo instead.";
    $("cameraMessage").classList.add("error");
    $("captureBtn").classList.add("hidden");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    $("cameraVideo").srcObject = cameraStream;
    await $("cameraVideo").play();
  } catch (err) {
    $("cameraMessage").textContent = "Could not open camera. Allow camera permission, use HTTPS, or choose a photo from your device.";
    $("cameraMessage").classList.add("error");
    $("captureBtn").classList.add("hidden");
  }
}
function closeCamera() { stopCamera(); cameraDialog.close(); }
function capturePhoto() {
  const video = $("cameraVideo");
  if (!video.videoWidth) { $("cameraMessage").textContent = "Camera is not ready yet. Try again in a moment."; return; }
  const canvas = $("cameraCanvas");
  const maxWidth = 1200;
  const ratio = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * ratio);
  canvas.height = Math.round(video.videoHeight * ratio);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) { $("cameraMessage").textContent = "Could not capture the photo. Please try again."; return; }
    capturedBlob = blob;
    $("cameraVideo").classList.add("hidden");
    canvas.classList.remove("hidden");
    canvas.toBlob(() => {}, "image/jpeg", .9);
    $("captureBtn").classList.add("hidden");
    $("useCaptureBtn").classList.remove("hidden");
    $("retakeBtn").classList.remove("hidden");
    $("cameraMessage").textContent = "Preview looks good? Use photo to attach it to this record.";
  }, "image/jpeg", .9);
}
async function useCapturedPhoto() {
  if (!capturedBlob) return;
  const file = new File([capturedBlob], "camera-photo.jpg", { type: "image/jpeg" });
  currentRecordPhoto = await readFileAsDataURL(file);
  updatePhotoPreview(); updateCardPreview(); closeCamera();
}
async function handlePhotoFile(file) {
  try {
    validateImage(file);
    currentRecordPhoto = await readFileAsDataURL(file);
    updatePhotoPreview(); updateCardPreview();
    toast("Photo ready. Save the record to keep it.");
  } catch (e) { toast(e.message || "Could not load photo."); }
}
async function handleLogoFile(file) {
  try {
    validateImage(file);
    currentLogo = await readFileAsDataURL(file);
    renderLogo();
  } catch (e) { toast(e.message || "Could not load logo."); }
}

document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("newRecordBtn").addEventListener("click", () => openRecord());
$("emptyAddBtn").addEventListener("click", () => openRecord());
$("closeDialogBtn").addEventListener("click", () => recordDialog.close());
$("cancelDialogBtn").addEventListener("click", () => recordDialog.close());
$("searchInput").addEventListener("input", renderRecords);
$("typeFilter").addEventListener("change", renderRecords);
recordForm.elements.type.addEventListener("change", () => { updateTypeLabels(); updateCardPreview(); });
["name","personId","className","role","phone","dob","motherName","fatherName","validTill"].forEach(k => recordForm.elements[k].addEventListener("input", updateCardPreview));
$("photoInput").addEventListener("change", async e => { if (e.target.files?.[0]) await handlePhotoFile(e.target.files[0]); e.target.value = ""; });
$("removePhotoBtn").addEventListener("click", () => { currentRecordPhoto = null; updatePhotoPreview(); updateCardPreview(); toast("Photo removed from this draft. Save to confirm."); });
$("cameraBtn").addEventListener("click", startCamera);
$("closeCameraBtn").addEventListener("click", closeCamera);
$("captureBtn").addEventListener("click", capturePhoto);
$("useCaptureBtn").addEventListener("click", useCapturedPhoto);
$("retakeBtn").addEventListener("click", startCamera);
$("logoInput").addEventListener("change", async e => { if (e.target.files?.[0]) await handleLogoFile(e.target.files[0]); e.target.value = ""; });
$("removeLogoBtn").addEventListener("click", () => { currentLogo = null; renderLogo(); });
institutionForm.addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(institutionForm);
  const old = getSettings();
  const settings = { name: String(fd.get("name") || "").trim(), address: String(fd.get("address") || "").trim(),
    phone: String(fd.get("phone") || "").trim(), session: String(fd.get("session") || "").trim(),
    colour: String(fd.get("colour") || "#173b67"), logo: currentLogo };
  try {
    saveSettings(settings);
    setMessage("institutionMessage", "Institution settings saved on this device.");
    updateCardPreview();
    toast("Institution settings saved.");
  } catch {
    saveSettings({ ...old, name: settings.name, address: settings.address, phone: settings.phone, session: settings.session, colour: settings.colour });
    setMessage("institutionMessage", "Could not save the logo. It may be too large; try a smaller image.", true);
  }
});
recordForm.addEventListener("submit", async e => {
  e.preventDefault();
  const record = recordValues();
  if (!record.name || !record.personId) { setMessage("recordMessage", "Enter a name and unique ID.", true); return; }
  const duplicate = records.find(r => r.personId.toLowerCase() === record.personId.toLowerCase() && r.id !== record.id);
  if (duplicate) { setMessage("recordMessage", `ID ${record.personId} is already used by ${duplicate.name}.`, true); return; }
  try {
    await putRecord(record);
    await reloadRecords();
    recordDialog.close();
    toast("Record saved on this device.");
  } catch (err) {
    setMessage("recordMessage", "Could not save. Device storage may be full. Export/backup features will be added in a later stage.", true);
  }
});

function updateOnlineStatus() {
  const online = navigator.onLine;
  $("offlineBadge").textContent = online ? "Ready" : "Offline";
  $("offlineBadge").style.background = online ? "#ffffff15" : "#ffffff30";
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
window.addEventListener("beforeunload", () => { if (cameraStream) cameraStream.getTracks().forEach(t => t.stop()); });

(async function init() {
  updateOnlineStatus();
  applyInstitutionForm();
  try {
    db = await openDatabase();
    await reloadRecords();
  } catch (e) {
    toast("Local database could not start. Try a modern browser with site storage enabled.");
  }
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
