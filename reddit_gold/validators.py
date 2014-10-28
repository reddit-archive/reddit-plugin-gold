import re

from r2.lib.errors import errors
from r2.lib.validator import Validator


class VSnooColor(Validator):
    """
    returns a valid css color string.
    only supports hex format
    """

    r_hex_color = re.compile(r"\A#([a-fA-F0-9]{3}){1,2}\Z")

    def run(self, color):
        if color:
            if self.r_hex_color.match(color):
                return color
            else:
                self.set_error(errors.BAD_CSS_COLOR)
        return ''

    def param_docs(self):
        return {
            self.param: "a valid css color in hexadecimal format",
        }
