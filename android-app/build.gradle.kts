// Plugins en el classpath raíz para que Kotlin y AGP compartan classloader.
// Con `-PcoreOnly` se omite AGP: así `:core:test` corre sin Android SDK ni Google Maven.
buildscript {
    repositories {
        if (!project.hasProperty("coreOnly")) google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        classpath(libs.kotlin.gradle.plugin)
        classpath(libs.kotlin.compose.gradle.plugin)
        if (!project.hasProperty("coreOnly")) classpath(libs.android.gradle.plugin)
    }
}
