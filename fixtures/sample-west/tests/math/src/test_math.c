#include <zephyr/ztest.h>

ZTEST_SUITE(math_suite, NULL, NULL, NULL, NULL, NULL);

ZTEST(math_suite, test_add)
{
	zassert_equal(1 + 1, 2, "1+1 should be 2");
}

ZTEST(math_suite, test_sub)
{
	zassert_equal(5 - 3, 2, "5-3 should be 2");
}

ZTEST(math_suite, test_mul)
{
	zassert_equal(3 * 4, 12, "3*4 should be 12");
}
