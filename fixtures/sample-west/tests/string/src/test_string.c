#include <zephyr/ztest.h>
#include <string.h>

ZTEST_SUITE(string_suite, NULL, NULL, NULL, NULL, NULL);

ZTEST(string_suite, test_strlen)
{
	zassert_equal(strlen("ztest"), 5, "strlen mismatch");
}

ZTEST(string_suite, test_strcmp)
{
	zassert_equal(strcmp("a", "a"), 0, "equal strings");
}

ZTEST(string_suite, test_empty_string)
{
	zassert_equal(strlen(""), 0, "empty string length");
}
