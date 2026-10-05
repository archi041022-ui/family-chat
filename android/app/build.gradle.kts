plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ru.family.chat"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.family.chat"
        minSdk = 26
        targetSdk = 35
        versionCode = 28
        versionName = "3.7"
    }

    // Постоянный ключ подписи: новые версии ставятся поверх старой
    signingConfigs {
        create("family") {
            storeFile = file("family.keystore")
            storePassword = "family2026"
            keyAlias = "family"
            keyPassword = "family2026"
        }
    }
    buildTypes {
        debug { signingConfig = signingConfigs.getByName("family") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("family")
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
    // мгновенные оповещения; настройки Firebase приходят с сервера семьи, файл google-services.json не нужен
    implementation("com.google.firebase:firebase-messaging:24.1.0")
}
