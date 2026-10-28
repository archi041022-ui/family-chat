plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Номер сборки приходит из CI (-PbuildNumber=N): по нему приложение узнаёт, что вышла новая версия
val bn = (project.findProperty("buildNumber") as String?)?.toIntOrNull() ?: 1
val siteUrl = (project.findProperty("siteUrl") as String?) ?: ""

android {
    namespace = "ru.kirprof.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.kirprof.app"
        minSdk = 26
        targetSdk = 35
        versionCode = bn
        versionName = "1.$bn"
        buildConfigField("int", "BUILD_NUMBER", "$bn")
        buildConfigField("String", "UPDATE_API", "\"https://api.github.com/repos/archi041022-ui/family-chat/releases?per_page=30\"")
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")      // адрес сайта, например https://kirprof.ru/ ; пусто — сайт внутри приложения
    }
    buildFeatures { buildConfig = true }

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
    implementation("androidx.work:work-runtime:2.9.1")
}
