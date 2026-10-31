package radio.rabble.android

import android.app.Application
import radio.rabble.android.data.RabbleApi
import radio.rabble.android.data.SessionStore

class RabbleApp : Application() {
    val baseUrl: String = BuildConfig.BASE_URL
    val session: SessionStore by lazy { SessionStore(baseUrl) }
    val api: RabbleApi by lazy { RabbleApi(baseUrl, session) }
}
