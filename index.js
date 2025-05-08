const { listFolders, createFolder, uploadFile, listSubFolders } = require("./googleDriveService");
const path = require("path");
const fs = require("fs");

let activeFolderId = null;
let activeFolderName = null;
let collectingMedia = false;
let collectedMedia = [];
let availableSubfolders = null;

const DRIVE_ID = '1BrBJf1T0BQJpQzPe7wXVL5Z_41P1p8ZB';

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  puppeteer: { args: ["--no-sandbox"] },
  authStrategy: new LocalAuth({
    clientId: "upload_bot",
    dataPath: "./.wwebjs_auth/session/",
  }),
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('\n✅ WhatsApp client is ready!\n'));

client.on('message', async (msg) => {
  const chat = await msg.getChat();
  console.log("Received message:", msg.body);

  if (msg.body.toUpperCase() === 'UPLOADNOW') {
    const folders = await listFolders(DRIVE_ID);
    let reply = "*Please select a folder by typing the number:*\n";

    if (folders && folders.length > 0) {
      chat.availableFolders = folders;
      folders.forEach((folder, index) => {
        reply += `${index + 1}. ${folder.name}\n`;
      });
      reply += `\n*Or type "NEW foldername"* to create a new folder inside this location!`;
    } else {
      reply = `⚠️ No folders found in the main folder.\n*Type "NEW foldername"* to create one!`;
      chat.availableFolders = null;
    }

    chat.sendMessage(reply);
    return;
  }

  if (msg.body.toUpperCase() === 'CLEARFOLDER') {
    activeFolderId = null;
    activeFolderName = null;
    availableSubfolders = null;
    chat.availableFolders = null;
    chat.sendMessage("🧹 Folder selection has been cleared. Use *UPLOADNOW* to start again.");
    return;
  }

  if (!isNaN(msg.body.trim()) && chat.availableFolders && !activeFolderId) {
    const index = parseInt(msg.body.trim()) - 1;
    if (index >= 0 && index < chat.availableFolders.length) {
      const selectedFolder = chat.availableFolders[index];
      activeFolderId = selectedFolder.id;
      activeFolderName = selectedFolder.name;

      const subfolders = await listSubFolders(activeFolderId);
      if (subfolders && subfolders.length > 0) {
        availableSubfolders = subfolders;
        let reply = `📂 You selected *${activeFolderName}*. Choose a subfolder by typing the number:\n`;
        subfolders.forEach((sf, i) => reply += `${i + 1}. ${sf.name}\n`);
        reply += "\n*Or type STARTUPLOAD to upload directly here.*";
        chat.sendMessage(reply);
      } else {
        chat.sendMessage(`📂 You selected *${activeFolderName}*. No subfolders. Type *STARTUPLOAD* to begin uploading files here.`);
      }
    } else {
      chat.sendMessage("⚠️ Invalid selection. Type a number from the list or *NEW foldername*.");
    }
    return;
  }

  if (!isNaN(msg.body.trim()) && availableSubfolders && activeFolderId && !collectingMedia) {
    const index = parseInt(msg.body.trim()) - 1;
    if (index >= 0 && index < availableSubfolders.length) {
      activeFolderId = availableSubfolders[index].id;
      activeFolderName = availableSubfolders[index].name;
      chat.sendMessage(`✅ Selected subfolder *${activeFolderName}*. Type *STARTUPLOAD* to begin uploading files here.`);
      availableSubfolders = null;
    } else {
      chat.sendMessage("⚠️ Invalid subfolder selection. Please type a number from the list or *STARTUPLOAD*.");
    }
    return;
  }

  if (msg.body.toUpperCase().startsWith('NEW ')) {
    const folderName = msg.body.substring(4).trim();
    if (folderName) {
      try {
        const newFolderId = await createFolder(folderName, activeFolderId || DRIVE_ID);
        activeFolderId = newFolderId;
        activeFolderName = folderName;
        chat.sendMessage(`✅ Created and selected folder *${folderName}*.\nSend files using *STARTUPLOAD* and *STOPUPLOAD*!`);
        chat.availableFolders = null;
        availableSubfolders = null;
      } catch (error) {
        console.error("Error creating folder:", error);
        chat.sendMessage(`❌ Could not create folder *${folderName}*. Please try again.`);
      }
    } else {
      chat.sendMessage("⚠️ Please provide a folder name (e.g., NEW My Folder).");
    }
    return;
  }

  if (msg.body.toUpperCase() === 'STARTUPLOAD') {
    if (!activeFolderId) {
      chat.sendMessage('❌ Please select a folder first using *UPLOADNOW*.');
      return;
    }
    collectingMedia = true;
    collectedMedia = [];
    chat.sendMessage(`🟢 Started collecting files for *${activeFolderName}*. Send your media now!\n\n📦 *Note*: WhatsApp blocks some formats (like .exe/.apk/.mov). Please zip such files before sending.`);
    return;
  }

  if (msg.body.toUpperCase() === 'STOPUPLOAD') {
    if (!collectingMedia) {
      chat.sendMessage('❌ Uploading not started yet. Type *STARTUPLOAD* first.');
      return;
    }

    collectingMedia = false;
    if (collectedMedia.length > 0) {
      chat.sendMessage(`🛑 Stopped collecting. Uploading ${collectedMedia.length} files to *${activeFolderName}*...`);

      for (let filePath of collectedMedia) {
        try {
          await uploadFile(filePath, activeFolderId);
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error("Error uploading file:", error);
          chat.sendMessage(`⚠️ Error uploading one of the files.`);
        }
      }

      const folderLink = `https://drive.google.com/drive/folders/${activeFolderId}`;
      chat.sendMessage(`✅ Successfully uploaded all ${collectedMedia.length} files to *${activeFolderName}*! 🎯\n\n🔗 *View Folder:* ${folderLink}`);
    } else {
      chat.sendMessage('⚠️ No files were collected for upload.');
    }
    collectedMedia = [];
    return;
  }

  if (msg.hasMedia && collectingMedia) {
    try {
      const media = await msg.downloadMedia();
      const mime = media.mimetype || 'application/octet-stream';
      let extension = 'bin';
      try { extension = mime.split('/')[1].split(';')[0]; } catch {}

      const tempFileName = `temp_${Date.now()}.${extension}`;
      const tempFilePath = path.join(__dirname, tempFileName);
      fs.writeFileSync(tempFilePath, Buffer.from(media.data, 'base64'));
      collectedMedia.push(tempFilePath);
      chat.sendMessage(`📥 File saved for upload!`);
    } catch (error) {
      console.error("Error saving media:", error);
      chat.sendMessage("⚠️ Could not save the file.");
    }
    return;
  }

  if (msg.hasMedia && activeFolderId && !collectingMedia) {
    try {
      const media = await msg.downloadMedia();
      const mime = media.mimetype || 'application/octet-stream';
      let extension = 'bin';
      try { extension = mime.split('/')[1].split(';')[0]; } catch {}

      const tempFileName = `temp_${Date.now()}.${extension}`;
      const tempFilePath = path.join(__dirname, tempFileName);

      fs.writeFileSync(tempFilePath, Buffer.from(media.data, 'base64'));
      await uploadFile(tempFilePath, activeFolderId);
      fs.unlinkSync(tempFilePath);

      const folderLink = `https://drive.google.com/drive/folders/${activeFolderId}`;
      chat.sendMessage(`✅ Uploaded to *${activeFolderName}* successfully!\n🔗 *View Folder:* ${folderLink}`);
    } catch (error) {
      console.error("Error uploading media directly:", error);
      chat.sendMessage("⚠️ Error uploading the file.");
    }
    return;
  }
});

client.initialize();
