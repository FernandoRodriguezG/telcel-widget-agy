import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    // Android ya incluye org.json en la plataforma; solo se agrega para compilar y probar en la JVM
    compileOnly(libs.org.json)
    testImplementation(libs.org.json)
    testImplementation(libs.junit)
}

tasks.test {
    // Mismos fixtures que valida tests/test_parser.mjs para el parser JS
    val fixtures = rootProject.file("../tests/fixtures/bait")
    inputs.dir(fixtures).withPathSensitivity(PathSensitivity.RELATIVE)
    systemProperty("baitFixturesDir", fixtures.absolutePath)
}
