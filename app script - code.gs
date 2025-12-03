function doGet(e) {
  try {
    return handleRequest(e);
  } catch (err) {
    console.error("doGet error:", err);
    return json({ success: false, error: "Server error in script (doGet)" });
  }
}

function doPost(e) {
  try {
    return handleRequest(e);
  } catch (err) {
    console.error("doPost error:", err);
    return json({ success: false, error: "Server error in script (doPost)" });
  }
}

function handleRequest(e) {
  e = e || { parameter: {} };
  const p = e.parameter || {};

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // === USERS SHEET ===
  let usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) {
    usersSheet = ss.insertSheet("Users");
    usersSheet.appendRow(["Username", "Password", "Phone", "Created"]);
  }

  // === JOBS SHEET ===
  let jobsSheet = ss.getSheetByName("Jobs");
  if (!jobsSheet) {
    jobsSheet = ss.insertSheet("Jobs");
    jobsSheet.appendRow([
      "Id", "Timestamp", "Name", "Phone", "Email", "Location",
      "Description", "Budget", "Status", "Offers",
      "ConfirmedFixerName", "ConfirmedFixerPhone"
    ]);
  }

  const action = p.action;

  // === REGISTER ===
  if (action === "register") {
    let username = (p.user || "").trim().toLowerCase();
    let password = (p.pass || "").trim();
    let phone = (p.phone || "").trim();
    if (!username || !password || !phone) {
      return json({ error: "All fields required" });
    }

    const userData = getUsersData(usersSheet); // Use helper to get data as objects
    const exists = userData.some(u => u.Username.toLowerCase() === username);
    if (exists) {
      return json({ error: "Username taken" });
    }

    usersSheet.appendRow([username, password, phone, new Date()]);
    return json({ success: true });
  }

  // === LOGIN ===
  if (action === "login") {
    let username = (p.user || "").trim().toLowerCase();
    let password = (p.pass || "").trim();
    if (!username || !password) {
      return json({ error: "Enter username & password" });
    }

    const userData = getUsersData(usersSheet);
    const found = userData.find(u => 
      u.Username.toLowerCase() === username && 
      String(u.Password).trim() === password // Convert to string + trim
    );

    if (found) {
      return json({ success: true, phone: found.Phone });
    } else {
      console.log("Login failed for:", username, "Password:", password);
      console.log("Available users:", userData.map(u => u.Username));
      return json({ error: "Wrong credentials" });
    }
  }

  // === GET ALL JOBS ===
  if (action === "getAll") {
    const data = jobsSheet.getDataRange().getValues();
    if (data.length === 0) return json([]);
    const headers = data[0];
    const rows = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] || "";
      });
      try {
        obj.Offers = obj.Offers ? JSON.parse(obj.Offers) : [];
      } catch (e) {
        obj.Offers = [];
      }
      return obj;
    });
    return json(rows);
  }

  // === SUBMIT JOB REQUEST ===
  if (action === "submitRequest") {
    const id = Utilities.getUuid();
    jobsSheet.appendRow([
      id,
      new Date(),
      p.name || "",
      p.phone || "",
      p.email || "",
      p.location || "",
      p.description || "",
      p.budget || "",
      "Open",
      "", // Offers
      "", // ConfirmedFixerName
      ""  // ConfirmedFixerPhone
    ]);
    return json({ success: true });
  }

  // === SUBMIT OFFER ===
  if (action === "submitOffer") {
    const requestId = p.requestId;
    const data = jobsSheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf("Id");
    const offersCol = headers.indexOf("Offers");

    if (idCol === -1 || offersCol === -1) {
      return json({ success: false, error: "Sheet missing Id or Offers column" });
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] == requestId) {
        let offers = [];
        try {
          offers = JSON.parse(data[i][offersCol] || "[]");
        } catch (e) {
          offers = [];
        }
        offers.push({
          name: p.name || "Anonymous",
          phone: p.phone || "",
          email: p.email || "",
          price: p.price || "",
          date: p.date || "",
          time: p.time || "",
          message: p.message || ""
        });
        jobsSheet.getRange(i + 1, offersCol + 1).setValue(JSON.stringify(offers));
        return json({ success: true });
      }
    }
    return json({ success: false, error: "Job not found" });
  }

  // === CONFIRM FIXER ===
  if (action === "confirmFixer") {
    const requestId = p.requestId;
    const offerIndex = parseInt(p.offerIndex, 10);
    if (isNaN(offerIndex)) {
      return json({ success: false, error: "Invalid offer index" });
    }

    const data = jobsSheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf("Id");
    const statusCol = headers.indexOf("Status");
    const offersCol = headers.indexOf("Offers");
    const nameCol = headers.indexOf("ConfirmedFixerName");
    const phoneCol = headers.indexOf("ConfirmedFixerPhone");

    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] == requestId) {
        let offers = [];
        try {
          offers = JSON.parse(data[i][offersCol] || "[]");
        } catch (e) {
          return json({ success: false, error: "Malformed offers data" });
        }

        const offer = offers[offerIndex];
        if (!offer) {
          return json({ success: false, error: "Offer not found at given index" });
        }

        jobsSheet.getRange(i + 1, statusCol + 1).setValue("Confirmed");
        jobsSheet.getRange(i + 1, nameCol + 1).setValue(offer.name);
        jobsSheet.getRange(i + 1, phoneCol + 1).setValue(offer.phone);
        return json({ success: true });
      }
    }
    return json({ success: false, error: "Job request not found" });
  }

  return json({ error: "Invalid action" });
}

// ✅ Helper: Get sheet data as array of objects with header keys
function getUsersData(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

// ✅ Safe JSON response
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
