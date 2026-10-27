plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ru.kirprof.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.kirprof.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // Постоянный ключ подписи: новые версии ставятся поверх старой
    signingConfigs {
        create("kirprof") {
            storeFile = file("kirprof.keystore")
            storePassword = "kirprof2026"
            keyAlias = "kirprof"
            keyPassword = "kirprof2026"
        }
    }
    buildTypes {
        debug { signingConfig = signingConfigs.getByName("kirprof") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("kirprof")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-ktx:1.13.1")
}
