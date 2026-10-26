#include <zephyr/ztest.h>
#include <string.h>

ZTEST_SUITE(string_suite, NULL, NULL, NULL, NULL, NULL);

ZTEST(string_suite, test_strlen)
{
	zassert_equal(strlen("ztest"), 5, "strlen mismatch");
}

ZTEST_USER(string_suite, test_strcmp)
{
	zassert_equal(strcmp("a", "a"), 0, "equal strings");
}

/* Intentionally failing case — mock runner marks this FAIL for demo. */
ZTEST(string_suite, test_fail_demo)
{
	zassert_true(false, "demo failure");
}
