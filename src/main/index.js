'use strict'
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../build/icon.png?asset'
import Store from 'electron-store'
import {windowStateKeeper} from './stateKeeper'
import { buildPlayerContext, normalizeRanking } from '../shared/player-data.mjs'
import * as http from 'http'
import * as https from 'https'
const moment = require('moment');
const store = new Store()

const usetestapi = false

process.env.NODE_ENV = app.isPackaged ? 'prod' : 'dev';
const hsapidomain = app.isPackaged || !usetestapi ? "hs.vtolvr.live" : "127.0.0.1";
const hsapiport = app.isPackaged || !usetestapi ? 443 : 3001;
const restapi = app.isPackaged || !usetestapi ? https : http;


let mainWindowStateKeeper, mainWindow
const createWindow = async () => {
  mainWindowStateKeeper = await windowStateKeeper('main');

  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: mainWindowStateKeeper.x,
    y: mainWindowStateKeeper.y,
    width: mainWindowStateKeeper.width,
    height: mainWindowStateKeeper.height,
    minHeight: 600,
    minWidth: 800,
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
    }
  })
  
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu(mainMenu);

  mainWindow.on('ready-to-show', async () => {
    if(mainWindowStateKeeper.isMaximized) mainWindow.maximize();
    mainWindow.show()
    mainWindowStateKeeper.track(mainWindow);
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.on('init', async (event) => {
  initdata()
});

const initdata = () => {
  console.log("initdata");
  const context = store.get("context");
  const favorites = store.get("favorites")
  
  if(Object.prototype.toString.call(favorites) === '[object Array]' || favorites === undefined) {
    store.set("favorites", {})
  }

  if(!context) {
    mainWindow.webContents.send('sendtohome');
    return
  }

  context.favorites = favorites ? Object.keys(favorites) : [];
  
  for(let player of context.ranking){
    if (player.kd === null) player.kd = Infinity
  }
  
  mainWindow.webContents.send('initdata', context);
}

ipcMain.on('updateranking', (event) => {
  getranking()
});

ipcMain.handle('getplayerdata', async (event, player) => {
  let data = await getplayerdata(player).catch((err) => {console.log(err)});
  return data
})

ipcMain.handle('flipfavorite', async (event, id) => {
  let status = store.get("favorites." + id)
  if(status === undefined){
    store.set("favorites." + id, true);
    return true;
  } else {
    store.delete("favorites." + id);
    return false;
  };
})

console.log("Appversion", app.getVersion());
ipcMain.handle('getAppversion', async (event) => {
  return app.getVersion()
})

const getranking =  async () => {
  console.log('getranking');
  spinnertext(true, "Getting rankings from server. This may take a while... <br>(Usually 15-30 seconds)");


  let data = await hsapiget("relevantUsers").catch((err) => {
    userMsg.send(err.message, false, "bg-danger", "readerror")
  });

  if(!data){
    spinnertext(false);
    return;
  }
  userMsg.clear("readerror")

  const ranking = normalizeRanking(data, { minKills: 11 });

  const favorites = store.get("favorites")

  const context = {
    ranking: ranking,
    updated: moment().valueOf(),
    favorites: favorites ? Object.keys(favorites) : [],
  }

  store.set("context.ranking", context.ranking)
  store.set("context.updated", context.updated)

  mainWindow.webContents.send('initranking', context);
  spinnertext(false);
};

const getplayerdata = (playerid) => {
  return new Promise(async (resolve,reject) => {
    spinnertext(true, "Fetching Player Data");
    if(!playerid) return reject("No player provided");

    let data = await hsapiget("users/"+playerid).catch((err) => {
      userMsg.send(err.message, false, "bg-danger", "readerror")
      return reject();
    });

    if(!data){
      spinnertext(false);
      return reject()
    }

    userMsg.clear("readerror")

    let context;
    try {
      context = buildPlayerContext(data);
      userMsg.clear("nodata");
    } catch (error) {
      userMsg.send(error.message, false, "bg-danger", "nodata")
      spinnertext(false);
      return reject(error.message);
    }

    spinnertext(false);
    resolve(context)
  });
};

const hsapiget = async (resource) => {
  return new Promise((resolve, reject) => {
    const options = {
      host: hsapidomain,
      port: hsapiport,
      path: '/api/v1/public/' + resource,
    }

    const req = restapi.get(options, (res) => {
      let chunks = [];
      res.on('data', function(chunk) {
        chunks.push(chunk);
      }).on('end', function() {
        let body = Buffer.concat(chunks);
        try {
          if(res.statusCode == 200 && res.headers['content-type'] == 'application/json; charset=utf-8'){
            resolve(JSON.parse(body));
          } else {
            if(res.headers['content-type'] == 'text/plain; charset=UTF-8'){
              throw new Error("Did not recieve a JSON response from the server: " + body.toString());
            }
            throw new Error("Did not recieve a JSON response from the server: unknown content-type");
          }
        } catch (error) {
          reject(error);
        }
      })
    });
    
    req.on('error', function(e) {
      console.log('ERROR: ' + e.message);
      reject(e);
    });
  });
};

const spinnertext = (state, text) => {
  mainWindow.send("spinnertext", [state, text]);
};

const userMsg = {
  /**
  * Footer message function
  * @param {string} msg - The message to be displayed in the footer
  * @param {int} timeout - How long the message should be shown for before it disappears. If set to false, the message will not disappear automatically.
  * @param {string} color - Add css class to change the color of the text
  * @param {string} id - Id for clearing later
  **/
  send: (msg, timeout, color, id) =>{
  mainWindow.webContents.send('showmsg', [msg,timeout,color,id]);
  },
  clear: (id) => {
    mainWindow.webContents.send('clearmsg', id);
  }
};

const mainMenuTemplate = [
  {
    label: 'Close',
    role: 'close',
    accelerator: process.platform ==  'darwin' ?  'Cmd+q' :  'Ctrl+Q',
  },
];

mainMenuTemplate.push({
  label: 'DevTools',
  submenu: [
    {
      label: 'Toggle Devtools',
      accelerator: 'CTRL+I',
      click(item, focusedWindow){
          focusedWindow.toggleDevTools();
      }
    },

  ]
})

if(process.env.NODE_ENV === 'dev') mainMenuTemplate.find((item) => item.label === 'DevTools').submenu.push({ role: 'reload', accelerator: 'CTRL+R' });

// Singleinstance handler
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.electron')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    createWindow()
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
