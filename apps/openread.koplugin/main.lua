local Device = require("device")
local Event = require("ui/event")
local Dispatcher = require("dispatcher")
local InfoMessage = require("ui/widget/infomessage")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local logger = require("logger")
local time = require("ui/time")
local util = require("util")
local sha2 = require("ffi/sha2")
local T = require("ffi/util").template
local _ = require("gettext")

local OpenreadSync = WidgetContainer:new{
    name = "openread",
    title = _("Openread Sync"),

    settings = nil,
}

local API_CALL_DEBOUNCE_DELAY = 30
local SUPABAE_ANON_KEY_BASE64 = "ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW5aaWMzbDRablZ6YW1weFpIaHJhbkZzZVhOaklpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzTXpReE1qTTJOekVzSW1WNGNDSTZNakEwT1RZNU9UWTNNWDAuM1U1VXFhb3VfMVNnclZlMWVvOXJBcGMwdUtqcWhwUWRVWGh2d1VIbVVmZw=="

OpenreadSync.default_settings = {
    supabase_url = "https://openread.supabase.co",
    supabase_anon_key = sha2.base64_to_bin(SUPABAE_ANON_KEY_BASE64),
    auto_sync = false,
    user_email = nil,
    user_name = nil,
    user_id = nil,
    access_token = nil,
    refresh_token = nil,
    expires_at = nil,
    expires_in = nil,
    last_sync_at = nil,
}

function OpenreadSync:init()
    self.last_sync_timestamp = 0
    self.settings = G_reader_settings:readSetting("openread_sync", self.default_settings)

    self.ui.menu:registerToMainMenu(self)
end

function OpenreadSync:onDispatcherRegisterActions()
    Dispatcher:registerAction("openread_sync_set_autosync",
        { category="string", event="OpenreadSyncToggleAutoSync", title=_("Set auto progress sync"), reader=true,
        args={true, false}, toggle={_("on"), _("off")},})
    Dispatcher:registerAction("openread_sync_toggle_autosync", { category="none", event="OpenreadSyncToggleAutoSync", title=_("Toggle auto openread sync"), reader=true,})
    Dispatcher:registerAction("openread_sync_push_progress", { category="none", event="OpenreadSyncPushProgress", title=_("Push openread progress from this device"), reader=true,})
    Dispatcher:registerAction("openread_sync_pull_progress", { category="none", event="OpenreadSyncPullProgress", title=_("Pull openread progress from other devices"), reader=true, separator=true,})
end

function OpenreadSync:onReaderReady()
    if self.settings.auto_sync and self.settings.access_token then
        UIManager:nextTick(function()
            self:pullBookConfig(false)
        end)
    end
    self:onDispatcherRegisterActions()
end

function OpenreadSync:addToMainMenu(menu_items)
    menu_items.openread_sync = {
        sorting_hint = "tools",
        text = _("Openread Sync"),
        sub_item_table = {
            {
                text_func = function()
                    return self:needsLogin() and _("Log in Openread Account")
                        or _("Log out as ") .. (self.settings.user_name or "")
                end,
                callback_func = function()
                    if self:needsLogin() then
                        return function(menu)
                            self:login(menu)
                        end
                    else
                        return function(menu)
                            self:logout(menu)
                        end
                    end
                end,
                separator = true,
            },
            {
                text = _("Auto sync book configs"),
                checked_func = function() return self.settings.auto_sync end,
                callback = function()
                    self:onOpenreadSyncToggleAutoSync()
                end,
                separator = true,
            },
            {
                text = _("Push book config now"),
                enabled_func = function()
                    return self.settings.access_token ~= nil and self.ui.document ~= nil
                end,
                callback = function()
                    self:pushBookConfig(true)
                end,
            },
            {
                text = _("Pull book config now"),
                enabled_func = function()
                    return self.settings.access_token ~= nil and self.ui.document ~= nil
                end,
                callback = function()
                    self:pullBookConfig(true)
                end,
            },
        }
    }
end

function OpenreadSync:needsLogin()
    return not self.settings.access_token or not self.settings.expires_at
        or self.settings.expires_at < os.time() + 60
end

function OpenreadSync:tryRefreshToken()
    if self.settings.refresh_token and self.settings.expires_at
        and self.settings.expires_at < os.time() + self.settings.expires_in / 2 then
        local client = self:getSupabaseAuthClient()
        client:refresh_token(self.settings.refresh_token, function(success, response)
            if success then
                self.settings.access_token = response.access_token
                self.settings.refresh_token = response.refresh_token
                self.settings.expires_at = response.expires_at
                self.settings.expires_in = response.expires_in
                G_reader_settings:saveSetting("openread_sync", self.settings)
            else
                logger.err("OpenreadSync: Token refresh failed:", response or "Unknown error")
            end
        end)
    end
end

function OpenreadSync:getSupabaseAuthClient()
    if not self.settings.supabase_url or not self.settings.supabase_anon_key then
        return nil
    end

    local SupabaseAuthClient = require("supabaseauth")
    return SupabaseAuthClient:new{
        service_spec = self.path .. "/supabase-auth-api.json",
        custom_url = self.settings.supabase_url .. "/auth/v1/",
        api_key = self.settings.supabase_anon_key,
    }
end

function OpenreadSync:getOpenreadSyncClient()
    if not self.settings.access_token or not self.settings.expires_at or self.settings.expires_at < os.time() then
        return nil
    end

    local OpenreadSyncClient = require("openreadsync")
    return OpenreadSyncClient:new{
        service_spec = self.path .. "/openread-sync-api.json",
        access_token = self.settings.access_token,
    }
end

function OpenreadSync:login(menu)
    if NetworkMgr:willRerunWhenOnline(function() self:login(menu) end) then
        return
    end

    local dialog
    dialog = MultiInputDialog:new{
        title = self.title,
        fields = {
            {
                text = self.settings.user_email,
                hint = "email@example.com",
            },
            {
                hint = "password",
                text_type = "password",
            },
        },
        buttons = {
            {
                {
                    text = _("Cancel"),
                    id = "close",
                    callback = function()
                        UIManager:close(dialog)
                    end,
                },
                {
                    text = _("Login"),
                    callback = function()
                        local email, password = unpack(dialog:getFields())
                        email = util.trim(email)
                        if email == "" or password == "" then
                            UIManager:show(InfoMessage:new{
                                text = _("Please enter both email and password"),
                                timeout = 2,
                            })
                            return
                        end
                        UIManager:close(dialog)
                        self:doLogin(email, password, menu)
                    end,
                },
            },
        },
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

function OpenreadSync:doLogin(email, password, menu)
    local client = self:getSupabaseAuthClient()
    if not client then
        UIManager:show(InfoMessage:new{
            text = _("Please configure Supabase URL and API key first"),
            timeout = 3,
        })
        return
    end

    UIManager:show(InfoMessage:new{
        text = _("Logging in..."),
        timeout = 1,
    })

    Device:setIgnoreInput(true)
    local success, response = client:sign_in_password(email, password)
    Device:setIgnoreInput(false)

    if success then
        self.settings.user_email = email
        self.settings.user_id = response.user.id
        self.settings.user_name = response.user.user_metadata.user_name or email
        self.settings.access_token = response.access_token
        self.settings.refresh_token = response.refresh_token
        self.settings.expires_at = response.expires_at
        self.settings.expires_in = response.expires_in
        G_reader_settings:saveSetting("openread_sync", self.settings)

        if menu then
            menu:updateItems()
        end
        
        UIManager:show(InfoMessage:new{
            text = _("Successfully logged in to Openread"),
            timeout = 3,
        })
    else
        UIManager:show(InfoMessage:new{
            text = _("Login failed: ") .. (response.msg or "Unknown error"),
            timeout = 3,
        })
    end
end

function OpenreadSync:logout(menu)
    if self.access_token then
        local client = self:getSupabaseAuthClient()
        if client then
            client:sign_out(self.settings.access_token, function(success, response)
                logger.dbg("OpenreadSync: Sign out result:", success)
            end)
        end
    end

    self.settings.access_token = nil
    self.settings.refresh_token = nil
    self.settings.expires_at = nil
    self.settings.expires_in = nil
    G_reader_settings:saveSetting("openread_sync", self.settings)

    if menu then
        menu:updateItems()
    end
    
    UIManager:show(InfoMessage:new{
        text = _("Logged out from Openread Sync"),
        timeout = 2,
    })
end

function normalizeIdentifier(identifier)
    if identifier:match("urn:") then
        -- Slice after the last ':'
        return identifier:match("([^:]+)$")
    elseif identifier:match(":") then
        -- Slice after the first ':'
        return identifier:match("^[^:]+:(.+)$")
    end
    return identifier
end

function normalizeAuthor(author)
    -- Trim leading and trailing whitespace
    author = author:gsub("^%s*(.-)%s*$", "%1")
    return author
end

function OpenreadSync:generateMetadataHash()
    local doc_props = self.ui.doc_settings:readSetting("doc_props") or {}
    local title = doc_props.title or ''
    if title == '' then
        local doc_path, filename = util.splitFilePathName(self.ui.doc_settings:readSetting("doc_path") or '')
        local basename, suffix = util.splitFileNameSuffix(filename)
        title = basename or ''
    end

    local authors = doc_props.authors or ''
    if authors:find("\n") then
        authors = util.splitToArray(authors, "\n")
        for i, author in ipairs(authors) do
            authors[i] = normalizeAuthor(author)
        end
        authors = table.concat(authors, ",")
    else
        authors = normalizeAuthor(authors)
    end

    local identifiers = doc_props.identifiers or ''
    if identifiers:find("\n") then
        local list = util.splitToArray(identifiers, "\n")
        local normalized = {}
        local priorities = { "uuid", "calibre", "isbn" }
        local preferred = nil
        for i, id in ipairs(list) do
            normalized[i] = normalizeIdentifier(id)
            local candidate = id:lower()
            for _, p in ipairs(priorities) do
                if candidate:find(p, 1, true) then
                    preferred = normalized[i]
                    break
                end
            end
        end
        if preferred then
            identifiers = preferred
        else
            identifiers = table.concat(normalized, ",")
        end
    else
        identifiers = normalizeIdentifier(identifiers)
    end
    local doc_meta = title .. "|" .. authors .. "|" .. identifiers
    local meta_hash = sha2.md5(doc_meta)
    return meta_hash
end

function OpenreadSync:getMetaHash()
    local doc_openread_sync = self.ui.doc_settings:readSetting("openread_sync") or {}
    local meta_hash = doc_openread_sync.meta_hash_v1
    if not meta_hash then
        meta_hash = self:generateMetadataHash()
        doc_openread_sync.meta_hash_v1 = meta_hash
        self.ui.doc_settings:saveSetting("openread_sync", doc_openread_sync)
    end
    return meta_hash
end

function OpenreadSync:getDocumentIdentifier()
    return self.ui.doc_settings:readSetting("partial_md5_checksum")
end

function OpenreadSync:showSyncedMessage()
    UIManager:show(InfoMessage:new{
        text = _("Progress has been synchronized."),
        timeout = 3,
    })
end

function OpenreadSync:applyBookConfig(config)
    logger.dbg("OpenreadSync: Applying book config:", config)
    local xpointer = config.xpointer
    local progress = config.progress
    local has_pages = self.ui.document.info.has_pages
    -- Check if it's the bracket format: [page,total_pages]
    local progress_pattern = "^%[(%d+),(%d+)%]$"
    if has_pages and progress then
        local page, total_pages = progress:match(progress_pattern)
        local current_page = self.ui:getCurrentPage()
        local new_page = tonumber(page)
        if new_page > current_page then
            self.ui.link:addCurrentLocationToStack()
            self.ui:handleEvent(Event:new("GotoPage", new_page))
            self:showSyncedMessage()
        end
    end
    if not has_pages and xpointer then
        local last_xpointer = self.ui.rolling:getLastProgress()
        local working_xpointer = xpointer
        local cmp_result = self.document:compareXPointers(last_xpointer, working_xpointer)
        -- FIXME: Crengine is not very good at comparing XPointers, so we need to reduce the path
        while cmp_result == nil and working_xpointer do
            local last_slash_pos = working_xpointer:match("^.*()/")
            if last_slash_pos and last_slash_pos > 1 then
                working_xpointer = working_xpointer:sub(1, last_slash_pos - 1)
                cmp_result = self.document:compareXPointers(last_xpointer, working_xpointer)
            else
                break
            end
        end
        if cmp_result > 0 then
            self.ui.link:addCurrentLocationToStack()
            self.ui:handleEvent(Event:new("GotoXPointer", working_xpointer))
            self:showSyncedMessage()
        end
    end
end

function OpenreadSync:getCurrentBookConfig()
    local book_hash = self:getDocumentIdentifier()
    local meta_hash = self:getMetaHash()
    if not book_hash or not meta_hash then
        UIManager:show(InfoMessage:new{
            text = _("Cannot identify the current book"),
            timeout = 2,
        })
        return nil
    end

    local config = {
        bookHash = book_hash,
        metaHash = meta_hash,
        progress = "",
        xpointer = "",
        updatedAt = os.time() * 1000,
    }

    local current_page = self.ui:getCurrentPage()
    local page_count = self.ui.document:getPageCount()
    config.progress = {current_page, page_count}

    if not self.ui.document.info.has_pages then
        config.xpointer = self.ui.rolling:getLastProgress()
    end

    return config
end

function OpenreadSync:pushBookConfig(interactive)
    if not self.settings.access_token or not self.settings.user_id then
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Please login first"),
                timeout = 2,
            })
        end
        return
    end

    local now = os.time()
    if not interactive and now - self.last_sync_timestamp <= API_CALL_DEBOUNCE_DELAY then
        logger.dbg("OpenreadSync: Debouncing push request")
        return
    end

    local config = self:getCurrentBookConfig()
    if not config then return end

    if interactive and NetworkMgr:willRerunWhenOnline(function() self:pushBookConfig(interactive) end) then
        return
    end

    local client = self:getOpenreadSyncClient()
    if not client then
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Please configure Openread settings first"),
                timeout = 3,
            })
        end
        return
    end

    self:tryRefreshToken()

    if interactive then
        UIManager:show(InfoMessage:new{
            text = _("Pushing book config..."),
            timeout = 1,
        })
    end

    local payload = {
      books = {},
      notes = {},
      configs = { config }
    }

    client:pushChanges(
        payload,
        function(success, response)
            if interactive then
                if success then
                    UIManager:show(InfoMessage:new{
                        text = _("Book config pushed successfully"),
                        timeout = 2,
                    })
                else
                    UIManager:show(InfoMessage:new{
                        text = _("Failed to push book config"),
                        timeout = 2,
                    })
                end
            end
            if success then
                self.last_sync_timestamp = os.time()
            end
        end
    )

end

function OpenreadSync:pullBookConfig(interactive)
    if not self.settings.access_token or not self.settings.user_id then
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Please login first"),
                timeout = 2,
            })
        end
        return
    end

    local book_hash = self:getDocumentIdentifier()
    local meta_hash = self:getMetaHash()
    if not book_hash or not meta_hash then return end

    if NetworkMgr:willRerunWhenOnline(function() self:pullBookConfig(interactive) end) then
        return
    end

    local client = self:getOpenreadSyncClient()
    if not client then
        if interactive then
            UIManager:show(InfoMessage:new{
                text = _("Please configure Openread settings first"),
                timeout = 3,
            })
        end
        return
    end

    self:tryRefreshToken()

    if interactive then
        UIManager:show(InfoMessage:new{
            text = _("Pulling book config..."),
            timeout = 1,
        })
    end

    client:pullChanges(
        {
            since = 0,
            type = "configs",
            book = book_hash,
            meta_hash = meta_hash,
        },
        function(success, response)
            if not success then
                if response and response.error == "Not authenticated" then
                    if interactive then
                        UIManager:show(InfoMessage:new{
                            text = _("Authentication failed, please login again"),
                            timeout = 2,
                        })
                    end
                    self:logout()
                    return
                end
                if interactive then
                    UIManager:show(InfoMessage:new{
                        text = _("Failed to pull book config"),
                        timeout = 2,
                    })
                end
                return
            end

            local data = response.configs
            if data and #data > 0 then
                local config = data[1]
                if config then
                    self:applyBookConfig(config)
                    if interactive then
                        UIManager:show(InfoMessage:new{
                            text = _("Book config synchronized"),
                            timeout = 2,
                        })
                    end
                    return
                end
            end
            
            if interactive then
                UIManager:show(InfoMessage:new{
                    text = _("No saved config found for this book"),
                    timeout = 2,
                })
            end
        end
    )
end

function OpenreadSync:onOpenreadSyncToggleAutoSync(toggle)
    if toggle == self.settings.auto_sync then
        return true
    end
    self.settings.auto_sync = not self.settings.auto_sync
    G_reader_settings:saveSetting("openread_sync", self.settings)
    if self.settings.auto_sync and self.ui.document then
        self:pullBookConfig(false)
    end
end

function OpenreadSync:onOpenreadSyncPushProgress()
    self:pushBookConfig(true)
end

function OpenreadSync:onOpenreadSyncPullProgress()
    self:pullBookConfig(true)
end

function OpenreadSync:onCloseDocument()
    if self.settings.auto_sync and self.settings.access_token then
        NetworkMgr:goOnlineToRun(function()
            self:pushBookConfig(false)
        end)
    end
end

function OpenreadSync:onPageUpdate(page)
    if self.settings.auto_sync and self.settings.access_token and page then
        if self.delayed_push_task then
            UIManager:unschedule(self.delayed_push_task)
        end
        self.delayed_push_task = function()
            self:pushBookConfig(false)
        end
        UIManager:scheduleIn(5, self.delayed_push_task)
    end
end

function OpenreadSync:onCloseWidget()
    if self.delayed_push_task then
        UIManager:unschedule(self.delayed_push_task)
        self.delayed_push_task = nil
    end
end

return OpenreadSync