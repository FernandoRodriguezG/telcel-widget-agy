dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        if (!providers.gradleProperty("coreOnly").isPresent) google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "MiBaitAndroid"
include(":core")
// `-PcoreOnly` permite correr las pruebas del parser sin Android SDK ni acceso a Google Maven
if (!providers.gradleProperty("coreOnly").isPresent) {
    include(":app")
}
