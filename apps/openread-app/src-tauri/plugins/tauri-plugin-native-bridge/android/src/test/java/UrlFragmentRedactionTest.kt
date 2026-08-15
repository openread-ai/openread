package com.openread.native_bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class UrlFragmentRedactionTest {
    @Test
    fun redactsFragmentBearingCallbackAndKeepsOriginAndPath() {
        val syntheticCallback =
            "openread://auth-callback#access_token=synthetic.access.token&refresh_token=synthetic.refresh.token&type=magiclink"
        val redacted = NativeBridgePlugin.redactUrlFragment(syntheticCallback)
        assertEquals("openread://auth-callback#<redacted>", redacted)
        assertFalse(redacted.contains("synthetic.access.token"))
        assertFalse(redacted.contains("synthetic.refresh.token"))
    }

    @Test
    fun leavesFragmentFreeUrlUnchanged() {
        val syntheticOutbound =
            "https://auth.example.test/authorize?client_id=synthetic-client&redirect_uri=openread://auth-callback&state=synthetic-state&code_challenge=synthetic-challenge"
        assertEquals(syntheticOutbound, NativeBridgePlugin.redactUrlFragment(syntheticOutbound))
        assertEquals(
            "openread://auth-callback",
            NativeBridgePlugin.redactUrlFragment("openread://auth-callback"),
        )
    }
}
