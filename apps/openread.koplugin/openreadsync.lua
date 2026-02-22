local UIManager = require("ui/uimanager")
local logger = require("logger")
local socketutil = require("socketutil")

-- Sync operation timeouts
local SYNC_TIMEOUTS = { 5, 10 }

local OpenreadSyncClient = {
    service_spec = nil,
    access_token = nil,
}

function OpenreadSyncClient:new(o)
    if o == nil then o = {} end
    setmetatable(o, self)
    self.__index = self
    if o.init then o:init() end
    return o
end

function OpenreadSyncClient:init()
    local Spore = require("Spore")
    self.client = Spore.new_from_spec(self.service_spec)
    
    -- Openread API headers middleware
    package.loaded["Spore.Middleware.OpenreadHeaders"] = {}
    require("Spore.Middleware.OpenreadHeaders").call = function(args, req)
        req.headers["content-type"] = "application/json"
        req.headers["accept"] = "application/json"
    end
    
    -- Openread Bearer token auth middleware
    package.loaded["Spore.Middleware.OpenreadAuth"] = {}
    require("Spore.Middleware.OpenreadAuth").call = function(args, req)
        if self.access_token then
            req.headers["authorization"] = "Bearer " .. self.access_token
        else
            logger.err("OpenreadSyncClient:access_token is not set, cannot authenticate")
            return false, "Access token is required for Openread API"
        end
    end
    
    package.loaded["Spore.Middleware.AsyncHTTP"] = {}
    require("Spore.Middleware.AsyncHTTP").call = function(args, req)
        -- disable async http if Turbo looper is missing
        if not UIManager.looper then return end
        req:finalize()
        local result
        require("httpclient"):new():request({
            url = req.url,
            method = req.method,
            body = req.env.spore.payload,
            on_headers = function(headers)
                for header, value in pairs(req.headers) do
                    if type(header) == "string" then
                        headers:add(header, value)
                    end
                end
            end,
        }, function(res)
            result = res
            -- Turbo HTTP client uses code instead of status
            -- change to status so that Spore can understand
            result.status = res.code
            coroutine.resume(args.thread)
        end)
        return coroutine.create(function() coroutine.yield(result) end)
    end
end

function OpenreadSyncClient:pullChanges(params, callback)
    self.client:reset_middlewares()
    self.client:enable("Format.JSON")
    self.client:enable("OpenreadHeaders", {})
    self.client:enable("OpenreadAuth", {})
    
    socketutil:set_timeout(SYNC_TIMEOUTS[1], SYNC_TIMEOUTS[2])
    local co = coroutine.create(function()
        local ok, res = pcall(function()
            return self.client:pullChanges({
                since = params.since,
                type = params.type,
                book = params.book,
                meta_hash = params.meta_hash,
            })
        end)
        if ok then
            callback(res.status == 200, res.body)
        else
            logger.dbg("OpenreadSyncClient:pullChanges failure:", res)
            callback(false, res.body)
        end
    end)
    self.client:enable("AsyncHTTP", {thread = co})
    coroutine.resume(co)
    if UIManager.looper then UIManager:setInputTimeout() end
    socketutil:reset_timeout()
end

function OpenreadSyncClient:pushChanges(changes, callback)
    self.client:reset_middlewares()
    self.client:enable("Format.JSON")
    self.client:enable("OpenreadHeaders", {})
    self.client:enable("OpenreadAuth", {})

    socketutil:set_timeout(SYNC_TIMEOUTS[1], SYNC_TIMEOUTS[2])
    local co = coroutine.create(function()
        local ok, res = pcall(function()
            return self.client:pushChanges(changes or {})
        end)
        if ok then
            callback(res.status == 200, res.body)
        else
            logger.dbg("OpenreadSyncClient:pushChanges failure:", res)
            callback(false, res.body)
        end
    end)
    self.client:enable("AsyncHTTP", {thread = co})
    coroutine.resume(co)
    if UIManager.looper then UIManager:setInputTimeout() end
    socketutil:reset_timeout()
end

return OpenreadSyncClient