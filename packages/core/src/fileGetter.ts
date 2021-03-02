'use strict';

import EventDelegate from './eventDelegate';
import * as Util from './util';
import EventEmitter from './eventBus';
import Delegate from './eventDelegate';

export default class {
  eventEmitter: EventEmitter;
  config: any;
  inputId: string;
  eventDelegate: Delegate;
  globalEventDelegate: Delegate;
  log: any;
  _uploadGroupId: number;
  accept: any;
  pushQueue: (file: any, groupInfo: any) => void;
  constructor(
    config: any = {},
    pushQueue: any,
    eventEmitter: EventEmitter,
    eventDelegate: Delegate,
  ) {
    this.config = config;
    this.inputId = 'fileUploadBtn-' + new Date().getTime();
    this.eventEmitter = eventEmitter;
    this.eventDelegate = eventDelegate;
    this.globalEventDelegate = new EventDelegate(document); // 全局的事件代理
    this.log = config.log;

    this._uploadGroupId = 0;

    this.pushQueue = (file: any, groupInfo: any) => {
      file = this.fileFilter(file);
      if (file) {
        file.selectFileTransactionId = this._uploadGroupId;
        pushQueue(file, groupInfo).catch((err: any) => {
          console.error(err);
        });
      }
    };

    if (Util.isPlainObject(this.config.accept)) {
      this.config.accept = [this.config.accept];
    }
    if (this.config.accept) {
      let arr = [];
      for (let i = 0, len = this.config.accept.length; i < len; i++) {
        let item = this.config.accept[i].extensions;
        item && arr.push(item);
      }
      if (arr.length) {
        this.accept =
          '\\.' +
          arr
            .join(',')
            .replace(/,/g, '$|\\.')
            .replace(/\*/g, '.*') +
          '$';
      }
      this.accept = new RegExp(this.accept, 'i');
    }
    this.init();
  }

  acceptFile = (file: File) => {
    let invalid =
      !file ||
      (this.accept &&
        // 如果名字中有后缀，才做后缀白名单处理。
        /\.\w+$/.exec(file.name) &&
        !this.accept.test(file.name));

    return !invalid;
  };

  fileFilter = (file: File) => {
    if (this.acceptFile(file)) {
      return file;
    } else {
      this.eventEmitter.emit('uploadError', file, '不支持的文件格式');
      return false;
    }
  };

  init() {
    let input = `<input type="file" id="${this.inputId}" name="fileselect[]" style="position:absolute;top:-100000px;">`;
    let inputEle = Util.parseToDOM(input)[0];

    let inputDir = `<input type="file" id="${this.inputId}Dir" webkitdirectory mozdirectory name="fileselect[]" style="position:absolute;top:-100000px;">`;
    let inputEleDir = Util.parseToDOM(inputDir)[0];

    if (this.config.accept && this.config.accept.length > 0) {
      let arr = [];

      for (let i = 0, len = this.config.accept.length; i < len; i++) {
        arr.push(this.config.accept[i].mimeTypes);
      }
      // @ts-ignore
      inputEle.setAttribute('accept', arr.join(','));
    }
    if (!!this.config.multiple) {
      // @ts-ignore
      inputEle.setAttribute('multiple', 'multiple');
    }

    // normal file input
    Util.removeDOM(`#${this.inputId}`);
    this.config.body.appendChild(inputEle);

    // dir file input
    if (this.config.pickDir) {
      Util.removeDOM(`#${this.inputId}Dir`);
      this.config.body.appendChild(inputEleDir);
    }
    this.reset();
    if (this.config.pick) {
      this._pickHandle();
    }
    if (this.config.pickDir) {
      this._pickDirHandler();
    }
    if (this.config.dnd) {
      this._dndHandle();
    }
    if (this.config.paste) {
      this._pasteHandle();
    }
  }

  _resetinput(ele: any) {
    ele.value = null;
  }

  reset = () => {
    let inputEle = document.querySelector(`#${this.inputId}`);
    inputEle && this._resetinput(inputEle);

    let inputEleDir = document.querySelector(`#${this.inputId}Dir`);
    inputEleDir && this._resetinput(inputEleDir);
  };

  _pasteHandle = () => {
    if (this.config.paste) {
      this.eventDelegate.on('paste', this.config.paste, async (event: any) => {
        let res = await this.eventEmitter.emit('onPaste', { event });
        if (res.indexOf(false) !== -1) {
          return;
        }

        let clipboardData = event.clipboardData;
        if (!!clipboardData) {
          let items = clipboardData.items;
          for (let i = 0; i < items.length; ++i) {
            let item = items[i];
            let blob = null;
            if (item.kind !== 'file' || !(blob = item.getAsFile())) {
              continue;
            }
            event.stopPropagation();
            event.preventDefault();
            this._uploadGroupId++;
            let groupInfo = {
              id: this._uploadGroupId,
              count: 1,
              current: 1,
            };
            this.pushQueue(blob, groupInfo);
          }
        }
      });
    }
  };

  _pickHandle = () => {
    this.globalEventDelegate.on(
      'change',
      `#${this.inputId}`,
      this._pickOnChange,
    );
    this.globalEventDelegate.on('click', this.config.pick, this._pickOnClick);
  };

  _pickDirHandler = () => {
    this.globalEventDelegate.on(
      'change',
      `#${this.inputId}Dir`,
      this._pickDirOnChange,
    );
    this.globalEventDelegate.on(
      'click',
      this.config.pickDir,
      this._pickDirOnClick,
    );
  };

  _pickOnChange = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    await this.getFiles(e, 'pick');
    this.reset(); // 重复文件会不触发
  };

  _pickOnClick = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    // @ts-ignore
    document.querySelector(`#${this.inputId}`).click();
  };

  _pickDirOnChange = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    await this.getFiles(e, 'pickDir');
    this.reset(); // 重复文件会不触发
  };

  _pickDirOnClick = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    // @ts-ignore
    document.querySelector(`#${this.inputId}Dir`).click();
  };

  _dndHandle = () => {
    if (this.config.dnd) {
      this.eventDelegate.on(
        'dragenter',
        this.config.dnd,
        this._dndHandleDragenter,
      );
      this.eventDelegate.on(
        'dragover',
        this.config.dnd,
        this._dndHandleDragover,
      );
      this.eventDelegate.on(
        'dragleave',
        this.config.dnd,
        this._dndHandleDragleave,
      );
      this.eventDelegate.on('drop', this.config.dnd, this._dndHandleDrop);
    }
  };

  _dndHandleDragenter = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  _dndHandleDragover = async (e: any) => {
    e.dataTransfer.dropEffect = 'copy'; // 兼容圈点APP
    e.stopPropagation();
    e.preventDefault();
    this.eventEmitter.emit('dragover');
  };
  _dndHandleDragleave = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    this.eventEmitter.emit('dragleave');
  };
  _dndHandleDrop = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    await this.getFiles(e, 'drop');
  };

  //获取选择文件，file控件或拖放
  // @actionType ['pick' || 'pickDir' || 'drop' ]
  getFiles = async (e: any, actionType: string) => {
    let tmpFileArr: any[] = [];
    this._uploadGroupId++;
    let uploadGroupId = this._uploadGroupId;

    let files = e.target.files || e.dataTransfer.files; // 后者在拖拽文件的情况会存在
    let items = (e.dataTransfer && e.dataTransfer.items) || []; // 拖拽的文件会有

    let filesArr = [].slice.call(files);
    let itemsArr = [].slice.call(items);
    let entryArr = itemsArr.map((item: any) =>
      item.getAsEntry
        ? item.getAsEntry()
        : item.webkitGetAsEntry
        ? item.webkitGetAsEntry()
        : null,
    );

    let res = await this.eventEmitter.emit('beforeFilesSourceQueued', {
      filesSource: filesArr,
      actionType,
      uploadGroupId,
    });
    if (res.indexOf(false) !== -1) {
      return;
    }

    // uploadDir
    if (actionType === 'pickDir') {
      if (filesArr.length === 0) {
        return;
      }
      tmpFileArr = filesArr.map(item => {
        Object.defineProperty(item, 'path', {
          // @ts-ignore
          value: '/' + item.webkitRelativePath,
        });
        return item;
      });

      let pathReg = /\/(.*)\//;
      let someFileName = tmpFileArr[0].path;
      let dirName = someFileName.match(pathReg)[1];

      let entry: any = {};
      entry.path = entry.fullPath = '/' + dirName;
      entry.uploadGroupId = uploadGroupId;

      let res = await this.eventEmitter.emit('selectDir', {
        entry,
        uploadGroupId,
        actionType,
      });
      if (res.indexOf(false) !== -1) {
        return;
      }
    } else {
      for (let i = 0, len = filesArr.length; i < len; i++) {
        let file = filesArr[i];
        // let item = itemsArr[i];
        let entry = entryArr[i];

        if (entry && entry.isDirectory) {
          await this.folderRead({
            entry,
            tmpFileArr,
            uploadGroupId,
            actionType,
          });
          continue;
        }

        // file.path = '/' + file.name; // PC版这种情况会有问题
        Object.defineProperty(file, 'path', { value: '/' + file['name'] });

        tmpFileArr.push(file);
      }
    }

    // TODO this.config.multiple to break the for cycle
    if (this.config.multiple === false) {
      tmpFileArr = tmpFileArr[0] || [];
    }

    tmpFileArr.forEach(async (item, index, array) => {
      let count = array.length;
      let current = index + 1;
      let groupInfo = {
        count,
        current,
        id: uploadGroupId,
      };
      await this.pushQueue(item, groupInfo);
    });
    await this.eventEmitter.emit('filesSourceQueued', {
      filesSource: tmpFileArr,
      uploadGroupId,
      actionType,
    });
  };

  // add custom field: path uploadGroupId
  async folderRead({ entry, tmpFileArr, uploadGroupId, actionType }: any) {
    // custom field
    entry.path = entry.fullPath;
    entry.uploadGroupId = uploadGroupId; // old selectFileTransactionId

    let eventResFlagArr = await this.eventEmitter.emit('selectDir', {
      entry,
      uploadGroupId,
      actionType,
    });
    if (eventResFlagArr.indexOf(false) !== -1) {
      return void 0;
    }

    return await new Promise(resolve => {
      entry.createReader().readEntries(async (entries: any[]) => {
        for (let i = 0; i < entries.length; i++) {
          let _entry = entries[i];

          if (_entry.isFile) {
            let file = await new Promise(r => {
              _entry.file((file: any) =>
                r(
                  Object.defineProperty(file, 'path', {
                    value: _entry.fullPath,
                  }),
                ),
              );
            });

            await this.eventEmitter.emit('beforeChildFileQueued', {
              fileSource: file,
              parentEntry: entry,
              uploadGroupId,
              actionType,
            });
            tmpFileArr.push(file);
            await this.eventEmitter.emit('childFileQueued', {
              fileSource: file,
              parentEntry: entry,
              uploadGroupId,
              actionType,
            });
          } else if (_entry.isDirectory) {
            await this.eventEmitter.emit('beforeChildDirQueued', {
              currentEntry: _entry,
              parentEntry: entry,
              uploadGroupId,
              actionType,
            });
            await this.folderRead({
              entry: _entry,
              tmpFileArr,
              uploadGroupId,
              actionType,
            });
            await this.eventEmitter.emit('childDirQueued', {
              currentEntry: _entry,
              parentEntry: entry,
              uploadGroupId,
              actionType,
            });
          }
        }
        resolve(true);
      });
    });
  }

  destroy() {
    this.eventEmitter.removeEvents();

    if (this.config.dnd) {
      this.eventDelegate.off('dragover');
      this.eventDelegate.off('dragleave');
      this.eventDelegate.off('drop');
    }
    if (this.config.paste) {
      this.eventDelegate.off('paste');
    }

    this.globalEventDelegate.off('change');
    if (this.config.pick || this.config.pickDir) {
      this.globalEventDelegate.off('click');
    }
  }

  on(eventSource: any, fn: any) {
    this.eventEmitter.on(eventSource, fn);
  }
}
