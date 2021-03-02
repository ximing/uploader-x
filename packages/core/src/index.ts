'use strict';

import EventEmitter from './eventBus';
import EventDelegate from './eventDelegate';
import { Transport } from './transport';
import { XFile } from './file';
import FileGetter from './fileGetter';
import createLog from './log.js';
// @ts-ignore
import MD5Worker from 'web-worker:./md5.worker';

export let CONSTANTS = {
  MD5_HAS: 'MD5_HAS',
};

let _config = {
  timeout: 0,
  accept: [],
  auto: true,
  sameTimeUploadCount: 3, // 同时上传个数
  chunked: false,
  chunkSize: 20971520,
  chunkRetry: 2,
  formData: {},
  headers: {},
  fileVal: 'file',
  method: 'POST',
  fileNumLimit: void 0,
  fileSizeLimit: void 0,
  fileSingleSizeLimit: void 0,
  dnd: void 0,
  pick: void 0,
  pickDir: void 0,
  paste: void 0,
  server: '',
  listenerContainer: document,
  body: document.body,
  multiple: false,
  withCredentials: false,
  setName: (id: any) => new Date().getTime() + id,
  log: (...args: any[]) => {
    console.log(...args);
  },
  logLevel: 1,
  fileIdPrefix: 'WU_FILE_',
  md5Calc: true,
  md5LimitSize: 1024 * 1024 * 1,
};

// 分片状态
let blobStatus = {
  WAIT: 'wait', // 已经进入队列等待上传
  PENDING: 'pending', // 正在上传中
  ERROR: 'error', // 上传出错(eg.网络错误等)
  SUCCESS: 'success', // 上传成功
  CANCELLED: 'cancelled', // 上传取消
  INTERRUPT: 'interrupt', // 上传中断，可续传
};

export class Uploader {
  blobsQueue: any[];
  config: any;
  eventEmitter: EventEmitter;
  eventDelegate: EventDelegate;
  LOG: any;
  fileGetter: FileGetter;
  transport?: Transport | null;

  constructor(config: any = {}) {
    this.blobsQueue = []; // 各个分片的队列
    this.config = Object.assign({}, _config, config);

    this.eventEmitter = new EventEmitter();
    this.eventDelegate = new EventDelegate(this.config.listenerContainer);
    this.LOG = createLog(this.config.log);
    // 这个写法还是蛮坑的
    // this.log = function () {
    //     let args = Array.prototype.slice.call(arguments, 0);
    //     args = ['FILE', ...args];
    //     this.config.log.apply(null, args);
    // }.bind(this);

    this.fileGetter = new FileGetter(
      this.config,
      this.pushQueue.bind(this),
      this.eventEmitter,
      this.eventDelegate,
    );
    this.fileProgressCalc(); // 全局文件进度监听
  }

  // 在这里有`beforeFileQueued`事件，用户可以在这个事件阻止文件被加入队列
  pushQueue = async (file: File, groupInfo: any) => {
    let xFile = new XFile(file, {
      eventEmitter: this.eventEmitter,
      setName: this.config.setName,
      fileIdPrefix: this.config.fileIdPrefix,
      groupInfo: groupInfo || {},
      uploadGroupInfo: groupInfo, // alias
    });
    try {
      let res = await this.eventEmitter.emit('beforeFileQueued', {
        file: xFile,
        setContentType: (type: any) => {
          // 允许用户自定义
          if (type) {
            let blobFile: any = new Blob([xFile.source], {
              type: type,
            });
            blobFile.file2blob = true;
            blobFile.lastModified = xFile.source.lastModified;
            blobFile.name = xFile.source.name;
            // blobFile.size = XFile.source.size;
            // blobFile.type = type;
            blobFile.lastModifiedDate = xFile.source.lastModifiedDate; // chrome专属
            blobFile.webkitRelativePath = xFile.source.webkitRelativePath; // chrome专属
            xFile.source = blobFile;
          }
        },
      });
      if (res.indexOf(false) === -1) {
        xFile.statusText = xFile.Status.QUEUED;
        await this.eventEmitter.emit('fileQueued', { file: xFile });
        if (this.config.auto) {
          this.sliceFile(xFile);
        }
        // TODO 不需要auto的时候还没做
      }
      this.LOG.INFO({
        lifecycle: 'pushQueue',
        fileStatus: xFile.statusText,
        fileName: xFile.name,
      });
    } catch (err) {
      this.LOG.ERROR({
        lifecycle: 'pushQueue',
        fileStatus: xFile.statusText,
        fileName: xFile.name,
        err,
      });
    }
  };

  calcMd5(file: XFile) {
    return new Promise(resolve => {
      let worker = new MD5Worker();
      worker.postMessage(file);
      worker.addEventListener('message', (message: any) => {
        resolve(message.data);
      });
      worker.addEventListener('error', () => {
        this.LOG.ERROR({
          lifecycle: 'calcMd5_worker',
          fileName: file.name,
          fileStatus: file.statusText,
          msg: 'md5 worker 错误',
        });
      });
    });
  }

  // 对文件进行分片 哈哈哈
  async sliceFile(XFile: XFile) {
    try {
      if (XFile.isFile === false) {
        return;
      }

      if (this.config.chunked) {
        let shardCount = Math.ceil(XFile.size / this.config.chunkSize);
        if (shardCount === 0) {
          shardCount = 1;
        }
        for (let i = 0, len = shardCount; i < len; i++) {
          let start = i * this.config.chunkSize;
          let end = Math.min(XFile.size, start + this.config.chunkSize);

          let blob = XFile.source.slice(start, end);
          if (len === 1) {
            // 只有一片的时候 保留分片信息 不进行slice 是为了保留Content-Type
            blob = XFile.source;
          }

          let shardObj = {
            shardCount: shardCount,
            currentShard: i + 1, // 分片从1开始，下标都要+1
          };
          await this.pushBlobQueue(blob, XFile, shardObj); // 需要异步等待
        }
      } else {
        let shardObj = {
          shardCount: 1,
          currentShard: 1, // 分片从1开始，下标都要+1
        };
        await this.pushBlobQueue(XFile.source, XFile, shardObj); // 需要异步等待
      }
      this.LOG.INFO({
        lifecycle: 'sliceFile',
        fileStatus: XFile.statusText,
        fileName: XFile.name,
      });
    } catch (err) {
      this.LOG.ERROR({
        lifecycle: 'sliceFile',
        fileStatus: XFile.statusText,
        fileName: XFile.name,
        err,
      });
    }
  }

  // 业务方自己传进来的文件
  pushFile(file: any) {
    if (Array.isArray(file)) {
      let id = 'initiative_' + new Date().getTime();
      this.LOG.INFO({
        lifecycle: 'initiative_pushFile_queue',
        fileId: id,
      });
      // @ts-ignore
      let count = file.leading;
      file.forEach((f, i) => {
        f.groupId = id;
        this.pushQueue(f, {
          count: count,
          current: i + 1,
          id: id,
        });
      });
    } else {
      let id = 'initiative_' + new Date().getTime();
      this.LOG.INFO({
        lifecycle: 'initiative_pushFile',
        fileId: id,
      });
      file.groupId = id;
      this.pushQueue(file, {
        count: 1,
        current: 1,
        id: file.groupId,
      });
    }
  }

  // 分片队列 推进分片队列的时候还会开始上传
  async pushBlobQueue(obj: Blob, file: XFile, shardObj: any) {
    try {
      // 分片对象
      let blobObj = {
        blob: obj,
        file: file, // XFile
        shard: shardObj,
        status: blobStatus.WAIT,
        loaded: 0,
        config: {
          server: this.config.server,
          headers: this.config.headers,
          formData: this.config.formData,
        },
      };
      this.LOG.INFO({
        lifecycle: 'pushBlobQueue',
        fileStatus: file.statusText,
        fileName: file.name,
      });
      this.blobsQueue.push(blobObj);

      // 正在上传的文件个数
      let pendingLen = this.blobsQueue.filter(
        item => item.status === blobStatus.PENDING,
      ).length;

      if (pendingLen < this.config.sameTimeUploadCount) {
        await this.runBlobQueue();
      }
      this.LOG.INFO({
        lifecycle: 'pushBlobQueue',
        fileStatus: file.statusText,
        fileName: file.name,
      });
    } catch (err) {
      this.LOG.ERROR({
        lifecycle: 'pushBlobQueue',
        fileStatus: file.statusText,
        fileName: file.name,
        err,
      });
    }
  }

  // 准备上传分片
  async runBlobQueue() {
    let _blobObj = null;
    try {
      let currentUploadCount = this.blobsQueue.filter(
        item => item.status === blobStatus.PENDING,
      ).length;

      // 数量超过就不再处理
      if (currentUploadCount >= this.config.sameTimeUploadCount) {
        return;
      }

      let blobObj = this.blobsQueue.find(
        item => item.status === blobStatus.WAIT,
      );
      _blobObj = blobObj;
      if (!blobObj) {
        return;
      } // 只有一个分片的时候
      blobObj.status = blobStatus.PENDING; // 由于是异步的关系 这个必须提前

      // 检测文件开始上传
      await this.checkFileUploadStart({
        file: blobObj.file, // 私有文件对象
        shardCount: blobObj.shard.shardCount, // 总分片数
        config: blobObj.config,
      });

      await this.eventEmitter.emit('uploadBeforeSend', {
        file: blobObj.file, // 私有文件对象
        shard: blobObj.blob, // 文件blob
        shardCount: blobObj.shard.shardCount, // 总分片数
        currentShard: blobObj.shard.currentShard, // 当前片数
        config: blobObj.config,
      });

      // 真正的上传
      blobObj.file.statusText = XFile.Status.PROGRESS;
      this.runBlobQueueHandler(blobObj);

      this.LOG.INFO({
        lifecycle: 'runBlobQueue',
        fileStatus: _blobObj.file.statusText,
        fileName: _blobObj.file.name,
      });
    } catch (err) {
      this.LOG.ERROR({
        lifecycle: 'runBlobQueue',
        fileStatus: _blobObj.file.statusText,
        fileName: _blobObj.file.name,
        info: err,
      });
    }
  }

  // 处理上传文件的成功或者失败 不能放到 runBlobQueue 是因为await会阻止 runBlobQueue
  async runBlobQueueHandler(blobObj: any) {
    // 这里不能在then里面用async function
    try {
      let res = await this._baseupload(blobObj);
      if (res !== undefined) {
        // 防止考虑不周的地方
        await this._uploadSuccess(res, blobObj);
      }
      this.runBlobQueue();
    } catch (err) {
      await this._catchUpfileError(err, blobObj);
      this.runBlobQueue();
    }
  }

  // 错误处理
  async _catchUpfileError(err: Error | string, blobObj: any) {
    // @ts-ignore
    let errText = (err.message ? err.message : err) || 'no error message';
    if (errText.indexOf('initiative interrupt') !== -1) {
      this.LOG.INFO({
        lifecycle: '_catchUpfileError',
        msg: 'initiative interrupt',
        fileStatus: blobObj.file.statusText,
        fileName: blobObj.file.name,
        fileId: blobObj.file.id,
      });
      return;
    }

    this.LOG.INFO({
      lifecycle: '_catchUpfileError',
      fileStatus: blobObj.file.statusText,
      fileName: blobObj.file.name,
      fileId: blobObj.file.id,
    });

    blobObj.file.statusText = XFile.Status.ERROR;
    // 已经错误处理过的文件就不需要处理了
    if (
      !(
        blobObj.status === blobStatus.CANCELLED ||
        blobObj.status === blobStatus.INTERRUPT ||
        blobObj.status === blobStatus.ERROR
      )
    ) {
      // 停止所有分片
      this.blobsQueue = this.blobsQueue.map(item => {
        // 是当前文件的分片并且该分片没有传输成功
        if (
          item.file.id === blobObj.file.id &&
          item.status !== blobStatus.SUCCESS
        ) {
          item.transport && item.transport.abort();
          item.status = blobStatus.ERROR;
          item.loaded = 0;
          this.LOG.INFO({
            lifecycle: '_catchUpfileError',
            msg: 'stop all shard',
            fileStatus: item.file.statusText,
            fileName: item.file.name,
            fileId: item.file.id,
          });
        }
        return item;
      });

      await this.eventEmitter.emit('uploadError', {
        file: blobObj.file,
        error: err,
      });

      await this.eventEmitter.emit('uploadEndSend', {
        file: blobObj.file,
        shard: blobObj.blob,
        shardCount: blobObj.shard.shardCount,
        currentShard: blobObj.shard.currentShard,
      });
    }

    // uploadSuccess callback error catch
    if (blobObj.status === blobStatus.SUCCESS) {
      await this.eventEmitter.emit('uploadError', {
        file: blobObj.file,
        error: err,
      });
      return;
    }
  }

  // 检测文件是否第一次开始上传分片
  async checkFileUploadStart(obj: any) {
    let { file, shardCount, config } = obj;

    let curFileShard = this.blobsQueue.filter(item => item.file.id === file.id);
    let pendingCount = 0;
    let successCount = 0;
    curFileShard.map(item => {
      if (item.status === blobStatus.PENDING) {
        // TODO 看看这个规则是否需要优化
        pendingCount++;
      }
      if (item.status === blobStatus.SUCCESS) {
        successCount++;
      }
    });
    // 正在上传的只有一个文件 并且没有文件上传成功 注意此条件不应该触发多次 重传的策略再想
    if (pendingCount === 1 && successCount === 0) {
      if (file.statusText === XFile.Status.QUEUED) {
        file.statusText = XFile.Status.PROGRESS;
        await this.eventEmitter.emit('uploadStart', {
          file: file,
          shardCount: shardCount,
          config: config,
        }); // 导出XFile对象
        if (this.config.md5Calc && file.size > this.config.md5LimitSize) {
          if (file.source instanceof Blob) {
            this.calcMd5(file.source)
              .then(async value => {
                file.md5 = value;
                // emit 的事件 处理完成后会回来，回来后一定是当前文件的
                let md5HandlerRes = await this.eventEmitter.emit(
                  'fileMd5Finished',
                  { file: file, md5: value },
                );
                if (md5HandlerRes.indexOf(CONSTANTS.MD5_HAS) !== -1) {
                  this.interruptFile(file.id, 'initiative_finished');
                  // file.statusText = FileStatus.COMPLETE;
                  console.log(file.name, value, 'emit fileMd5Finished');
                }
              })
              .catch(() => {
                this.LOG.ERROR({
                  lifecycle: 'checkFileUploadStart',
                  fileName: file.name,
                  fileStatus: file.statusText,
                  msg: 'md5 事件错误',
                });
              });
          } else {
            // TODO 处理FakeBrowserFile的情况
            // electron 渲染进程中
          }
        }
      } else {
        this.LOG.ERROR({
          lifecycle: 'checkFileUploadStart',
          fileName: file.name,
          fileStatus: file.statusText,
          msg: '检测第一次上传文件出错',
        });
        // 不应该出现这个debugger的
      }
    }
  }

  // 检查文件是否传输完毕
  checkFileUploadEnd(file: XFile) {
    // 除了success已经没有其他成功状态了
    let currentFileShard = this.blobsQueue.filter(
      item => item.file.id === file.id,
    );
    let notSuccessShard = currentFileShard.filter(
      item => item.status !== blobStatus.SUCCESS,
    );

    return notSuccessShard.length === 0; // 为0则表示传输完毕了
  }

  // 文件上传成功之后
  async _uploadSuccess(res: any, blobObj: any) {
    blobObj.status = blobStatus.SUCCESS;
    let isFileUploadEnd = this.checkFileUploadEnd(blobObj.file);
    if (isFileUploadEnd) {
      blobObj.file.statusText = XFile.Status.COMPLETE;
    }

    // 不分片的时候
    if (blobObj.shard.shardCount === 1) {
      blobObj.file.responseText = res;
    } else {
      // 分片的时候
      if (!Array.isArray(blobObj.file.responseTextArr)) {
        blobObj.file.responseTextArr = Array(blobObj.shard.shardCount - 1).fill(
          null,
        );
      }
      blobObj.file.responseTextArr[blobObj.shard.currentShard - 1] = res;
    }

    // 每个分片成功后的
    await this.eventEmitter.emit('uploadAccept', {
      file: blobObj.file,
      shard: blobObj.blob,
      shardCount: blobObj.shard.shardCount,
      currentShard: blobObj.shard.currentShard,
      isUploadEnd: isFileUploadEnd,
      responseText: res,
    });

    // 文件传输是否完成
    if (isFileUploadEnd) {
      let successParams = {
        file: blobObj.file,
        shard: blobObj.blob,
        shardCount: blobObj.shard.shardCount,
        currentShard: blobObj.shard.currentShard,
        responseText: '',
        responseTextArr: [],
      };
      if (blobObj.shard.shardCount === 1) {
        successParams.responseText = blobObj.file.responseText;
      } else {
        successParams.responseTextArr = blobObj.file.responseTextArr;
      }
      await this.eventEmitter.emit('uploadSuccess', successParams);

      await this.eventEmitter.emit('uploadEndSend', {
        file: blobObj.file,
        shard: blobObj.blob,
        shardCount: blobObj.shard.shardCount,
        currentShard: blobObj.shard.currentShard,
      });
      // 只能在成功的时候移除分片 如果提前移除分片会导致进度计算不准确
      this._removeFileFromQueue(blobObj.file.id);
    }
  }

  _removeFileFromQueue(id: number | string) {
    this.blobsQueue = this.blobsQueue.filter(blobObj => blobObj.file.id !== id);
  }

  interruptFile(id: number | string, type = 'interrupted') {
    let fileObj: any = null;
    this.blobsQueue.forEach(item => {
      if (item.file.id === id && item.status !== blobStatus.SUCCESS) {
        item.file.statusText = XFile.Status.INTERRUPT;
        item.status = blobStatus.INTERRUPT;
        item.transport && item.transport.abort();
        if (!fileObj) {
          fileObj = item;
        }
      }
    });

    if (fileObj) {
      // interrupted(中断) initiative_finished(主动完成 秒传用)
      this.eventEmitter.emit(type, { file: fileObj.file });
    }
  }

  //中断所有
  interruptAllFile() {
    this.blobsQueue.forEach(item => {
      item.status = blobStatus.INTERRUPT;
      item.file.statusText = XFile.Status.CANCELLED;
      item.transport && item.transport.abort();
    });
  }

  // 重传
  reUpload(id: number | string) {
    // 重传的时候uploadStart事件不触发
    this.blobsQueue.forEach(item => {
      if (
        item.file.id === id &&
        item.status !== blobStatus.WAIT &&
        item.status !== blobStatus.PENDING &&
        item.status !== blobStatus.SUCCESS
      ) {
        item.status = blobStatus.WAIT;
        item.file.statusText = XFile.Status.QUEUED;
        this.runBlobQueue();
      }
    });
  }

  async _baseupload(blobObj: any) {
    // 加入了第三个参数
    try {
      let config = {
        server: blobObj.config.server,
        headers: blobObj.config.headers,
        method: this.config.method,
        fileVal: this.config.fileVal,
        timeout: this.config.timeout, // 2分钟
        formData: this.config.formData,
        fileName: blobObj.file.name,
        withCredentials: this.config.withCredentials,
        LOG: this.LOG,
      };
      let res = null;
      for (let i = 0; i < this.config.chunkRetry; i++) {
        if (blobObj.status !== blobStatus.PENDING) {
          throw new Error('initiative interrupt'); // 防止终止后retry继续触发
        }
        try {
          this.transport = new Transport(
            blobObj.blob,
            this.eventEmitter,
            config,
            blobObj,
          );
          blobObj.transport = this.transport; // 为了能够abort
          res = await this.transport.send();
          break;
        } catch (err) {
          if (i >= this.config.chunkRetry - 1) {
            throw new Error(err);
          }
        }
      }
      this.transport = null;
      return res;
    } catch (err) {
      this.LOG.ERROR({
        lifecycle: '_baseupload',
        fileStatus: blobObj.file.statusText,
        fileName: blobObj.file.name,
        err,
      });
      throw err;
    }
  }

  // 文件上传进度监听 只会运行一次
  fileProgressCalc() {
    this.eventEmitter.on(
      'uploadBlobProgress',
      (shardLoaded: any, shardTotal: any, blobObj: any) => {
        // 修复abort后还会抛出progress事件的问题
        if (blobObj.status !== blobStatus.PENDING) {
          return;
        }
        blobObj.loaded = shardLoaded;

        let currentLoaded = 0;
        let fileTotalSize = blobObj.file.size;

        let currentFileBlobArr = this.blobsQueue.filter(
          item => blobObj.file.id === item.file.id,
        );
        currentFileBlobArr.forEach(item => (currentLoaded += item.loaded));
        currentLoaded =
          currentLoaded > fileTotalSize ? fileTotalSize : currentLoaded; // 偶尔会超过整体的大小
        blobObj.file.loaded = currentLoaded;

        this.eventEmitter.emit('uploadProgress', {
          file: blobObj.file,
          loaded: currentLoaded,
          total: fileTotalSize,
          shardLoaded: shardLoaded,
          shardTotal: shardTotal,
        });
      },
    );
  }

  on(eventSource: any, fn: any) {
    this.eventEmitter.on(eventSource, fn);
  }

  destroy() {
    this.fileGetter.destroy();
    this.blobsQueue = this.blobsQueue.filter(item => {
      item.transport && item.transport.abort();
      item.status = blobStatus.CANCELLED;
      // @ts-ignore
      item.file.statusText = XFile.CANCELLED;
      return false;
    });
  }

  static CONSTANTS = CONSTANTS;
  static FileStatus = XFile.Status;
}

export let FileStatus = XFile.Status;

export default Uploader;
