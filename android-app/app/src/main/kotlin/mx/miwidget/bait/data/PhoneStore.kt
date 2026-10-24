package mx.miwidget.bait.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Número Bait cifrado con AES-256-GCM usando una llave del Android Keystore
 * (equivalente al Keychain de iOS para `BAIT_PHONE`). La llave nunca sale del dispositivo.
 */
class PhoneStore(context: Context) {
    private val prefs = context.getSharedPreferences("bait_secure", Context.MODE_PRIVATE)

    fun get(): String? {
        val stored = prefs.getString(KEY_PHONE, null) ?: return null
        return runCatching {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, existingKey() ?: return null, GCMParameterSpec(128, bytes, 0, IV_SIZE))
            String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
        }.getOrNull()
    }

    fun save(phone: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, existingKey() ?: createKey())
        val encrypted = cipher.iv + cipher.doFinal(phone.toByteArray(Charsets.UTF_8))
        prefs.edit().putString(KEY_PHONE, Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    fun clear() {
        prefs.edit().remove(KEY_PHONE).apply()
        runCatching { keyStore().deleteEntry(KEY_ALIAS) }
    }

    private fun keyStore() = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun existingKey(): SecretKey? = keyStore().getKey(KEY_ALIAS, null) as? SecretKey

    private fun createKey(): SecretKey = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        .apply {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
        }
        .generateKey()

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "bait_phone_key"
        const val KEY_PHONE = "BAIT_PHONE"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
    }
}
