import { Button, SafeAreaView, TextInput } from 'react-native';
import { useLayoutEffect, useContext, useState } from 'react';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import updateUser from '../../api/endpoints/me/update-email';
import { AuthContext} from '../../context/AuthProvider';

export default function UpdateEmailScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [email, setEmail] = useState(user.email);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          title="Done"
          onPress={async () => {
            await updateUser({
              email,
            });

            navigation.goBack();
          }}
        />
      ),
    });
  }, [navigation, email]);

  return (
    <SafeAreaView>
      <TableView>
        <Section>
          <Cell
            cellContentView={
              <TextInput
                value={email}
                onChangeText={(text) => setEmail(text)}
                keyboardType={'email-address'}
                autoCapitalize={'none'}
              />
            }
          />
        </Section>
      </TableView>
    </SafeAreaView>
  )
};
