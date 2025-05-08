const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load service account key
const KEYFILEPATH = 'whatsapp-uploader-459216-5ec348b776f8.json'; // <-- replace with your file name
const SCOPES = ['https://www.googleapis.com/auth/drive'];

// Auth Client
const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});

// Create Drive instance
const drive = google.drive({ version: 'v3', auth });

// List folders within a specified folder in "My Drive"
async function listFolders(folderId) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    return res.data.files;
  } catch (err) {
    console.error("Error listing folders:", err);
    return null;
  }
}

// Create folder within a specified folder in "My Drive"
async function createFolder(name, parentFolderId) {
  try {
    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId], // Create within the specified parent folder
    };
    const res = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    return res.data.id;
  } catch (err) {
    console.error("Error creating folder:", err);
    return null;
  }
}

// Upload file to a specific folder
async function uploadFile(filePath, folderId) {
  try {
    const fileName = path.basename(filePath);
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };
    const media = {
      body: fs.createReadStream(filePath),
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true,
    });

    return res.data.id;
  } catch (err) {
    console.error("Error uploading file:", err);
    return null;
  }
}

// Fetch subfolders within a folder
async function listSubFolders(parentId) {
  try {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    return res.data.files;
  } catch (err) {
    console.error("Error listing subfolders:", err);
    return null;
  }
}

module.exports = {
  listFolders,
  createFolder,
  uploadFile,
  listSubFolders,
};