declare var require: any

export const localforage = require('localforage')
localforage.config({
  name: 'CFS'
})