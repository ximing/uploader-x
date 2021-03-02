/*
 * the event delegate library
 *
 * */
'use strict';

// module.exports = Delegate;

function isArray(obj: any) {
  return Object.prototype.toString.call(obj) === '[object Array]';
}

export default class Delegate {
  eventPool: any;
  root: any;
  constructor(root: any) {
    var rootElement = null;

    if (typeof root === 'string') {
      rootElement = document.querySelector(root);
    } else {
      rootElement = root;
    }

    if (!rootElement) {
      throw new Error('please give valid root element or root selector');
    }

    this.root = rootElement;
    this.eventPool = {}; // save event callback function
  }

  on(event: any, selector: any, callback: any) {
    var selectorArr = isArray(selector) ? selector : selector.split(',');
    if (!this.eventPool[event]) {
      this.eventPool[event] = [];
    }
    var eventFunc = function(e: any) {
      for (var i = 0, len = selectorArr.length; i < len; i++) {
        if (e.target.closest(selectorArr[i])) {
          callback(e);
        }
      }
    };
    this.eventPool[event].push(eventFunc);
    this.root.addEventListener(event, eventFunc, false);
  }

  off(event: string) {
    var curEvPool = this.eventPool[event];
    if (curEvPool) {
      for (var i = 0, len = curEvPool.length; i < len; i++) {
        this.root.removeEventListener(event, curEvPool[i]);
      }
    }
  }
}
/**
 * Finds the closest parent that matches a selector.
 *
 * @param {Element} element
 * @param {String} selector
 * @return {Function}
 */
if (typeof Element.prototype.closest !== 'function') {
  Element.prototype.closest = function closest(selector: any) {
    var element: any = this;

    while (element && element.nodeType === 1) {
      if (element.matches(selector)) {
        return element;
      }

      element = element.parentNode;
    }

    return null;
  };
}

// matches hack
if (typeof Element !== 'undefined' && !Element.prototype.matches) {
  var proto = Element.prototype;
  proto.matches =
    // @ts-ignore
    proto.matchesSelector ||
    // @ts-ignore
    proto.mozMatchesSelector ||
    // @ts-ignore
    proto.msMatchesSelector ||
    // @ts-ignore
    proto.oMatchesSelector ||
    proto.webkitMatchesSelector;
}
