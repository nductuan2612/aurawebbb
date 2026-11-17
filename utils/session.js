'use strict';
/** Bản Promise của các thao tác phiên (express-session chỉ có callback). */
const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
const destroy = (req) => new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));

module.exports = { regenerate, save, destroy };
