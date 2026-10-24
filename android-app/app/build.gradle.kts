import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Firma estable opcional desde CI (secrets BAIT_KEYSTORE_*); sin ella el APK queda firmado con la llave debug
val releaseKeystore = System.getenv("BAIT_KEYSTORE_PATH")?.let(::file)?.takeIf { it.exists() }

android {
    namespace = "mx.miwidget.bait"
    compileSdk = 35

    defaultConfig {
        applicationId = "mx.miwidget.bait"
        minSdk = 26
        targetSdk = 35
        // Cada build de CI incrementa versionCode para poder instalar encima de la versión anterior
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        // En releases CI toma la versión del tag (android-v1.2.3 -> 1.2.3)
        versionName = System.getenv("BAIT_VERSION_NAME") ?: "0.1.0-dev"
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = releaseKeystore
                storePassword = System.getenv("BAIT_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BAIT_KEY_ALIAS")
                keyPassword = System.getenv("BAIT_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.work.runtime.ktx)
}
