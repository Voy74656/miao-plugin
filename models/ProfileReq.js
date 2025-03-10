import Base from './Base.js'
import fetch from 'node-fetch'

export default class ProfileReq extends Base {
  constructor (e) {
    super()
    this.e = e
    this.uid = e.uid
  }

  static create (e) {
    if (!e || !e.uid) {
      return false
    }
    return new ProfileReq(e)
  }

  async setCd (seconds = 60) {
    let ext = new Date() * 1 + seconds * 1000
    await redis.set(`miao:profile-cd:${this.uid}`, ext + '', { EX: seconds })
  }

  async inCd () {
    let ext = await redis.get(`miao:profile-cd:${this.uid}`)
    if (!ext || isNaN(ext)) {
      return false
    }
    let cd = (new Date() * 1) - ext
    if (cd < 0 && Math.abs(cd) < 100 * 60 * 1000) {
      return Math.ceil(0 - cd / 1000)
    }
    return false
  }

  err (msg = '', cd = 0) {
    let serv = this.serv
    let extra = serv.name ? `当前面板服务${serv.name}，` : ''
    const msgs = {
      error: `UID${this.uid}更新面板失败，${extra}\n可能是面板服务维护中，请稍后重试...`,
      empty: '请将角色放置在【游戏内】角色展柜，并打开【显示详情】，等待5分钟重新获取面板'
    }
    msg = msgs[msg] || msg
    this.msg(msg)
    // 设置CD
    if (cd) {
      this.setCd(cd)
    }
    return false
  }

  msg (msg) {
    let e = this.e
    if (msg && !e._isReplyed) {
      e.reply(msg)
      e._isReplyed = true
    }
  }

  async requestProfile (player, serv) {
    this.serv = serv
    let uid = this.uid
    let reqParam = await serv.getReqParam(uid)
    let cdTime = await this.inCd()
    if (cdTime && !process.argv.includes('web-debug')) {
      return this.err(`请求过快，请${cdTime}秒后重试..`)
    }
    await this.setCd(20)
    let self = this
    // 若3秒后还未响应则返回提示
    setTimeout(() => {
      if (self._isReq) {
        this.msg(`开始获取uid:${uid}的数据，可能会需要一定时间~`)
      }
    }, 3000)
    // 发起请求
    logger.mark(`面板请求UID:${uid}，面板服务：${serv.name}...`)
    let data = {}
    try {
      let params = reqParam.params || {}
      params.timeout = params.timeout || 1000 * 20
      self._isReq = true
      let req = await fetch(reqParam.url, params)
      data = await req.text()
      self._isReq = false
      if (data[0] === '<') {
        let titleRet = /<title>(.+)<\/title>/.exec(data)
        if (titleRet && titleRet[1]) {
          data = { error: titleRet[1] }
        } else {
          return this.err('error', 60)
        }
      } else {
        data = JSON.parse(data)
      }
    } catch (e) {
      console.log('面板请求错误', e)
      self._isReq = false
      data = {}
    }
    data = await serv.response(data, this)
    // 设置CD
    cdTime = serv.getCdTime(data)
    if (cdTime) {
      await this.setCd(cdTime)
    }
    if (data === false) {
      return false
    }
    serv.updatePlayer(player, data)
    cdTime = serv.getCdTime(data)
    if (cdTime) {
      await this.setCd(cdTime)
    }
    return player
  }
}
