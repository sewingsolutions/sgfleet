import os

os.environ.setdefault("SGFLEET_ENCRYPTION_KEY", "0" * 64)

import pytest
from app.crypto import decrypt, encrypt


class TestEncryptDecrypt:

    def test_roundtrip(self):
        ciphertext = encrypt("my-secret-value")
        assert ciphertext  # non-empty
        assert decrypt(ciphertext) == "my-secret-value"

    def test_roundtrip_unicode(self):
        original = "hello \u2603 \u4e16\u754c"
        assert decrypt(encrypt(original)) == original

    def test_roundtrip_empty(self):
        assert encrypt("") == ""
        assert decrypt("") == ""

    def test_different_keys_produce_different_ciphertext(self):
        ct1 = encrypt("same-plaintext")
        ct2 = encrypt("same-plaintext")
        assert ct1 != ct2

    def test_decrypt_wrong_key_raises(self):
        ct = encrypt("secret")
        # Temporarily change the key by re-importing with a different env var
        import app.crypto

        old_key = app.crypto._key
        try:
            app.crypto._key = None
            os.environ["SGFLEET_ENCRYPTION_KEY"] = "1" * 64
            try:
                with pytest.raises(RuntimeError, match="SGFLEET_ENCRYPTION_KEY may have changed"):
                    decrypt(ct)
            finally:
                os.environ["SGFLEET_ENCRYPTION_KEY"] = "0" * 64
                app.crypto._key = old_key
        finally:
            pass

    def test_decrypt_invalid_ciphertext_raises(self):
        with pytest.raises(RuntimeError, match="SGFLEET_ENCRYPTION_KEY may have changed"):
            decrypt("not-valid-base64-ciphertext!!!")

    def test_no_encryption_key_raises(self):
        import app.crypto

        old_key = app.crypto._key
        old_env = os.environ.pop("SGFLEET_ENCRYPTION_KEY", None)
        try:
            app.crypto._key = None
            with pytest.raises(RuntimeError, match="SGFLEET_ENCRYPTION_KEY"):
                encrypt("test")
        finally:
            app.crypto._key = old_key
            if old_env:
                os.environ["SGFLEET_ENCRYPTION_KEY"] = old_env
