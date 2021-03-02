'use strict';

function isObject(val: any) {
  return val != null && typeof val === 'object' && Array.isArray(val) === false;
}

function isObjectObject(o: any) {
  return (
    isObject(o) === true &&
    Object.prototype.toString.call(o) === '[object Object]'
  );
}
// https://github.com/jonschlinkert/is-plain-object/blob/master/index.js
export function isPlainObject(o: any) {
  var ctor, prot;

  if (isObjectObject(o) === false) return false;

  // If has modified constructor
  ctor = o.constructor;
  if (typeof ctor !== 'function') return false;

  // If has modified prototype
  prot = ctor.prototype;
  if (isObjectObject(prot) === false) return false;

  // If constructor does not have an Object-specific method
  if (prot.hasOwnProperty('isPrototypeOf') === false) {
    return false;
  }

  // Most likely a plain Object
  return true;
}

export function parseToDOM(str: any) {
  var div = document.createElement('div');
  if (typeof str == 'string') {
    div.innerHTML = str;
  }
  return div.childNodes;
}

export function removeDOM(selector: any) {
  var el = null;
  if (typeof selector === 'string') {
    el = document.querySelector(selector);
  } else {
    el = selector;
  }

  if (el) {
    el.parentNode.removeChild(el);
  }
}

export function formatSize(byte: number) {
  var a = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = 0;
  var c = function(s: number) {
    i++;
    return s / 1024;
  };

  while (byte > 1024) {
    byte = c(byte);
  }

  return Math.round(byte * 100) / 100 + a[i];
}

// TODO 判断文件是否图片 UNDO
