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

/*
 * Intentionally failing demo case — useful for exercising
 * ZTEST Suit fail icons and auto-poilot-fix.
 * Remove or fix once you no longer need a deliberate failure.
 */
ZTEST(string_suite, test_fail_demo)
{
	zassert_true(false, "demo failure for ztest-suit");
}
