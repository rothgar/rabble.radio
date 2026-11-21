plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "radio.rabble.android"
    compileSdk = 37

    defaultConfig {
        applicationId = "radio.rabble.android"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"

        // Base URL of the rabble.radio deployment. Override for local dev with
        //   ./gradlew assembleDebug -PrabbleBaseUrl=http://10.0.2.2:3000
        val baseUrl = (project.findProperty("rabbleBaseUrl") as String?)
            ?: "https://rabble.rodeo"
        buildConfigField("String", "BASE_URL", "\"$baseUrl\"")
    }

    // Release signing reads from CI env vars (ANDROID_RELEASE_KEYSTORE_PATH/
    // _PASSWORD, ANDROID_RELEASE_KEY_ALIAS, ANDROID_RELEASE_KEY_PASSWORD; see
    // docs/DEPLOY.md) so no keystore material is ever committed. bundleRelease
    // fails without them — only the CI job that has the secrets runs it.
    signingConfigs {
        create("release") {
            storeFile = System.getenv("ANDROID_RELEASE_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("ANDROID_RELEASE_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_RELEASE_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_RELEASE_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.livekit.android)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.work.runtime)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.json)
}
