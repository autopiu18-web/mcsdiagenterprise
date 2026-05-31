package com.mcs.diagnostics.companion

import android.content.Context
import com.neovisionaries.ws.client.WebSocket
import com.neovisionaries.ws.client.WebSocketAdapter
import com.neovisionaries.ws.client.WebSocketFactory
import kotlinx.coroutines.*
import timber.log.Timber
import org.json.JSONObject

class WebSocketClient(private val context: Context) {
    private var ws: WebSocket? = null
    private val wsFactory = WebSocketFactory()
    private var reconnectJob: Job? = null
    private val listeners = mutableListOf<(String, JSONObject) -> Unit>()

    fun connect(host: String = "127.0.0.1", port: Int = 8080, scope: CoroutineScope) {
        scope.launch(Dispatchers.IO) {
            try {
                val url = "ws://$host:$port"
                Timber.d("Connecting to WebSocket: $url")

                ws = wsFactory.createSocket(url)
                ws?.addListener(object : WebSocketAdapter() {
                    override fun onConnected(websocket: WebSocket?, headers: MutableMap<String, MutableList<String>>?) {
                        Timber.d("WebSocket connected")
                        sendMessage("client_type", "client_type" to "android_companion")
                    }

                    override fun onTextMessage(websocket: WebSocket?, text: String?) {
                        text?.let {
                            try {
                                val json = JSONObject(it)
                                Timber.d("Received: ${json.optString("type")}")
                                listeners.forEach { listener -> listener(it, json) }
                            } catch (e: Exception) {
                                Timber.e(e, "Error parsing WebSocket message")
                            }
                        }
                    }

                    override fun onDisconnected(websocket: WebSocket?, serverCloseFrame: WebSocket.Frame?, clientCloseFrame: WebSocket.Frame?, closedByServer: Boolean) {
                        Timber.d("WebSocket disconnected")
                        scheduleReconnect(scope)
                    }

                    override fun onError(websocket: WebSocket?, cause: WebSocketException?) {
                        Timber.e(cause, "WebSocket error")
                        scheduleReconnect(scope)
                    }
                })

                ws?.connectAsynchronously()
            } catch (e: Exception) {
                Timber.e(e, "Failed to create WebSocket")
                scheduleReconnect(scope)
            }
        }
    }

    private fun scheduleReconnect(scope: CoroutineScope) {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(3000L)
            if (ws?.isOpen != true) {
                connect(scope = this)
            }
        }
    }

    fun sendMessage(type: String, vararg pairs: Pair<String, Any?>) {
        try {
            val json = JSONObject().apply {
                put("type", type)
                put("timestamp", System.currentTimeMillis())
                pairs.forEach { (key, value) ->
                    put(key, value)
                }
            }
            ws?.sendText(json.toString())
            Timber.d("Sent: $type")
        } catch (e: Exception) {
            Timber.e(e, "Error sending message")
        }
    }

    fun addListener(listener: (String, JSONObject) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (String, JSONObject) -> Unit) {
        listeners.remove(listener)
    }

    fun isConnected(): Boolean = ws?.isOpen == true

    fun disconnect() {
        reconnectJob?.cancel()
        ws?.disconnect()
        ws = null
        Timber.d("WebSocket disconnected")
    }
}
